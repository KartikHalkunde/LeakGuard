# EXPECT: CLEAN
def read(path):
    f = open(path)
    try:
        return f.read()
    finally:
        f.close()
