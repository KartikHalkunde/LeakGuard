# EXPECT: CLEAN
def process(path_a, path_b, flag):
    if flag:
        f = open(path_a)
        f.close()
    else:
        f = open(path_b)
        f.close()
