# EXPECT: CLEAN
def copy(src, dst):
    with open(src) as fin, open(dst, "w") as fout:
        fout.write(fin.read())
