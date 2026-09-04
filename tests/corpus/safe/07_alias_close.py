# EXPECT: CLEAN
def read(path):
    a = open(path)
    data = a.read()
    b = a
    b.close()
    return data
