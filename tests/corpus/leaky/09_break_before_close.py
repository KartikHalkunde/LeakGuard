# EXPECT: LEAK var=f line=4
def find_first(paths, target):
    for path in paths:
        f = open(path)
        if path == target:
            break
        f.close()
    return True
