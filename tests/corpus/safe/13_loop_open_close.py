# EXPECT: CLEAN
def process_all(paths):
    for path in paths:
        f = open(path)
        f.read()
        f.close()
