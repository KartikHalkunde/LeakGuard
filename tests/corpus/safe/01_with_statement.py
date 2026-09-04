# EXPECT: CLEAN
def read(path):
    with open(path) as f:
        return f.read()
