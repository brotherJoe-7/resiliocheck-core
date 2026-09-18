from setuptools import setup, find_packages

setup(
    name="resiliocheck",
    version="1.0.0",
    description="ResilioCheck CLI - Deep Security Analysis",
    packages=find_packages(),
    install_requires=[
        "fastapi",
        "uvicorn",
        "python-dotenv",
        "sqlalchemy",
        "groq",
        "cryptography"
    ],
    entry_points={
        "console_scripts": [
            "resiliocheck=backend.cli:main",
        ],
    },
)
