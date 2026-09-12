from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from backend import settings

SQLALCHEMY_DATABASE_URL = settings.DATABASE_URL

# Heroku / Render style URLs use the deprecated "postgres://" scheme.
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args: dict = {}
engine_kwargs: dict = {"pool_pre_ping": True}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
    engine_kwargs = {}

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args=connect_args, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
