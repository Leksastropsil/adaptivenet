from mangum import Mangum
from .lk21_app import app

handler = Mangum(app)
