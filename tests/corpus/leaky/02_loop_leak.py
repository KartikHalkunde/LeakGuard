# EXPECT: LEAK var=f line=4
def process_all(paths):
    for path in paths:
        f = open(path)
        f.read()
    f.close()
    return True
