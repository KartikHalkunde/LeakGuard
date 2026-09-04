# EXPECT: LEAK var=f line=3
def process(path_a, path_b):
    f = open(path_a)
    f = open(path_b)
    f.close()
