const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const Parent = require('../models/Parent');
const Student = require('../models/Student');
const Registration = require('../models/Registration');
const Attendance = require('../models/Attendance');
const Payment = require('../models/Payment');
const { authenticate, authorize } = require('../middleware/auth');

// POST /api/parents — Admin creates or links a parent to a student
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { first_name, last_name, email, phone, student_id } = req.body;
    if (!first_name || !last_name || !email || !student_id) {
      return res.status(400).json({ success: false, message: 'Name, email, and student ID are required' });
    }

    const student = await Student.findById(student_id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    // If parent already exists just link the new student
    let parent = await Parent.findOne({ email });
    if (parent) {
      if (!parent.student_ids.map(id => id.toString()).includes(student._id.toString())) {
        parent.student_ids.push(student._id);
        await parent.save();
      }
      return res.json({ success: true, message: 'Existing parent linked to this student', data: parent });
    }

    // Auto-generate default password from student's ID number
    // e.g. student_number = "STU-001234" → default password is "STU-001234"
    const defaultPassword = student.student_number;
    const password_hash = await bcrypt.hash(defaultPassword, 10);

    parent = await Parent.create({ tenant_id: req.tenant_id, 
      first_name, last_name, email, phone,
      password_hash,
      tenant_id: student.tenant_id,
      student_ids: [student._id],
      force_password_change: true,
    });

    res.status(201).json({
      success: true,
      message: `Parent account created. Default password is the student ID: ${defaultPassword}`,
      data: { ...parent.toObject(), default_password_hint: defaultPassword }
    });
  } catch (err) {
    console.error(err);
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'A parent account with this email already exists' });
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/parents — Admin lists all parents
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const parents = await Parent.find().populate('student_ids', 'first_name last_name student_number');
    res.json({ success: true, data: parents });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/parents/student/:studentId — Admin/Teacher view parent for a specific student
router.get('/student/:studentId', authenticate, authorize('admin', 'teacher'), async (req, res) => {
  try {
    const parents = await Parent.find({ student_ids: req.params.studentId });
    res.json({ success: true, data: parents });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/parents/dashboard — Parent views their children's data
router.get('/dashboard', authenticate, authorize('parent'), async (req, res) => {
  try {
    const parent = await Parent.findById(req.user.id).populate('student_ids');
    if (!parent) return res.status(404).json({ success: false, message: 'Parent not found' });

    const childrenData = [];

    for (const student of parent.student_ids) {
      const registrations = await Registration.find({ student_id: student._id });

      const attendanceRecords = await Attendance.find({ 'records.student_id': student._id });
      let presentCount = 0, totalDays = 0;
      attendanceRecords.forEach(att => {
        const record = att.records.find(r => r.student_id.toString() === student._id.toString());
        if (record) { totalDays++; if (record.status === 'present') presentCount++; }
      });
      const attendanceRate = totalDays > 0 ? ((presentCount / totalDays) * 100).toFixed(1) : 100;

      const payments = await Payment.find({ student_id: student._id }).sort({ payment_date: -1 });

      childrenData.push({
        id: student._id,
        name: `${student.first_name} ${student.last_name}`,
        student_number: student.student_number,
        registrations,
        attendanceRate,
        payments
      });
    }

    res.json({ success: true, data: childrenData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
