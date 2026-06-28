#!/bin/bash
echo "Waiting for CLASS build to complete..."
# More specific: only match build processes (make/gcc/g++) working on classy in current directory
CURRENT_DIR=$(pwd -P)
while pgrep -f "make.*classy|gcc.*classy|g\+\+.*classy" | while read pid; do
    # Check if the process is working in our current directory tree
    if [ -d "/proc/$pid" ]; then
        PROC_CWD=$(readlink -f /proc/$pid/cwd 2>/dev/null)
        if [[ "$PROC_CWD" == "$CURRENT_DIR" || "$PROC_CWD" == "$CURRENT_DIR"/* ]]; then
            echo "$pid"
        fi
    fi
done | grep -q .; do
    sleep 2
done
echo "Build complete!"
if [ -f "python/classy.cpython"*.so ] || [ -f "python/classy.so" ]; then
    echo "✓ Python wrapper built successfully"
    ls -lh python/classy*.so
else
    echo "✗ Python wrapper not found"
fi

