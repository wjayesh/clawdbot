#!/bin/bash
# Ralph Wiggum Loop for Mahilo Plugin Development
# Runs Claude Code repeatedly until COMPLETE is signaled
#
# Usage: ./ralph.sh [max_iterations]
# Default: 50 iterations

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAHILO_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$(dirname "$MAHILO_DIR")")"  # clawdbot root
PROGRESS_FILE="$MAHILO_DIR/progress-plugin.txt"
MAX_ITERATIONS="${1:-50}"

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
    echo "# Mahilo Plugin Development Progress" > "$PROGRESS_FILE"
    echo "" >> "$PROGRESS_FILE"
    echo "Started: $(date)" >> "$PROGRESS_FILE"
    echo "" >> "$PROGRESS_FILE"
    echo "---" >> "$PROGRESS_FILE"
    echo "" >> "$PROGRESS_FILE"
    echo "## Session Log" >> "$PROGRESS_FILE"
    echo "" >> "$PROGRESS_FILE"
fi

echo "========================================"
echo " Mahilo Plugin - Ralph Wiggum Loop"
echo "========================================"
echo ""
echo "Project Dir: $PROJECT_DIR"
echo "Plugin will be at: $PROJECT_DIR/extensions/mahilo"
echo "Progress File: $PROGRESS_FILE"
echo "Max Iterations: $MAX_ITERATIONS"
echo ""

# Change to clawdbot root so Claude has full project context
cd "$PROJECT_DIR"

# SHORT prompt - Claude reads the files itself
PROMPT="Read docs/mahilo/CLAUDE-PLUGIN.md for full instructions. Check docs/mahilo/progress-plugin.txt for what is done. Find next pending P0 task in docs/mahilo/tasks-plugin.md and implement it. Update task status and progress file when done. Say COMPLETE when all tasks are finished."

for i in $(seq 1 $MAX_ITERATIONS); do
    echo ""
    echo "==============================================================="
    echo " Iteration $i of $MAX_ITERATIONS"
    echo " $(date)"
    echo "==============================================================="
    echo ""

    # Append iteration marker to progress file
    echo "" >> "$PROGRESS_FILE"
    echo "### Iteration $i - $(date)" >> "$PROGRESS_FILE"
    echo "" >> "$PROGRESS_FILE"

    # Kill any lingering claude processes
    pkill -f "claude.*--print" 2>/dev/null || true
    sleep 1

    # Run Claude Code with SHORT prompt
    # --no-session-persistence ensures truly fresh session each iteration
    OUTPUT=$(claude --dangerously-skip-permissions --no-session-persistence -p "$PROMPT" 2>&1 | tee /dev/stderr) || true

    # Check for completion signal
    if echo "$OUTPUT" | grep -q "COMPLETE"; then
        echo ""
        echo "========================================"
        echo " COMPLETE signal detected!"
        echo " Finished at iteration $i of $MAX_ITERATIONS"
        echo "========================================"
        echo "" >> "$PROGRESS_FILE"
        echo "## COMPLETED" >> "$PROGRESS_FILE"
        echo "Finished at: $(date)" >> "$PROGRESS_FILE"
        exit 0
    fi

    echo ""
    echo "Iteration $i complete. Continuing in 3 seconds..."
    sleep 3
done

echo ""
echo "========================================"
echo " Reached max iterations ($MAX_ITERATIONS)"
echo " Check progress-plugin.txt for status"
echo "========================================"
exit 1
