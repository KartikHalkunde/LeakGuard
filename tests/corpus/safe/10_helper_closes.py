# EXPECT: CLEAN
def cleanup(f):
    f.close()
def work(path):
    f = open(path)
    cleanup(f)
