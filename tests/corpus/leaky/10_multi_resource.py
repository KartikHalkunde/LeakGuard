# EXPECT: LEAK var=g line=4 confidence=definite
def process(path_a, path_b):
    f = open(path_a)
    g = open(path_b)
    f.close()
    return True
