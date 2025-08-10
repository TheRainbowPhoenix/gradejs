#!/usr/bin/env python3
import os
import sys
from pathlib import Path

def embed_folder_to_markdown(root_dir: Path, output_file: Path):
    with output_file.open('w', encoding='utf-8') as out:
        for file_path in sorted(root_dir.rglob('*')):
            if file_path.is_file():
                # compute relative path

                rel = file_path.relative_to(root_dir)
                if ".py" in str(rel) or "node_modules" in str(rel):
                    continue

                out.write(f"- `{rel}`\n")
                # open code block (no language specified)
                out.write("```\n")
                # read and write file contents
                try:
                    with file_path.open('r', encoding='utf-8') as f:
                        out.write(f.read())
                except UnicodeDecodeError:
                    # binary or non-utf8? read in binary and repr()
                    with file_path.open('rb') as f:
                        data = f.read()
                    out.write(data.decode('utf-8', errors='replace'))
                out.write("\n```\n\n")

def main():
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <folder> <output.md>")
        sys.exit(1)

    root_dir = Path(sys.argv[1]).resolve()
    output_file = Path(sys.argv[2]).resolve()

    if not root_dir.is_dir():
        print(f"Error: '{root_dir}' is not a directory.")
        sys.exit(1)

    embed_folder_to_markdown(root_dir, output_file)
    print(f"Embedded {root_dir} → {output_file}")

if __name__ == "__main__":
    main()
