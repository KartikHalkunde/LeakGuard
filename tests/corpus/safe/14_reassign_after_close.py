# EXPECT: CLEAN
def process(path_a, path_b):
    f = open(path_a)
    f.close()
    f = open(path_b)
    f.close()
