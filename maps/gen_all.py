#!/usr/bin/env python3
"""Regenerate every BX1 map. Run:  python3 gen_all.py"""
import gen_hush, gen_wreath

if __name__ == "__main__":
    gen_hush.main()
    gen_wreath.main()
    print("done. hush_map.png and wreath_map.png are up to date.")
