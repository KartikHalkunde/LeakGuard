# EXPECT: LEAK var=f line=3
def process(path, verbose):
    f = open(path)
    if verbose:
        f.close()
    return True
