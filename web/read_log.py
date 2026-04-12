import os

log_path = r"d:\rahul_paid_projects\rahulsecurityapp\web\convex_error.log"
try:
    if os.path.exists(log_path):
        # Try different encodings
        encodings = ['utf-16-le', 'utf-16', 'utf-8']
        for enc in encodings:
            try:
                with open(log_path, "r", encoding=enc) as f:
                    content = f.read()
                    if content:
                        print(f"--- Log Start ({enc}) ---")
                        print(content[-2000:])
                        print("--- Log End ---")
                        break
            except Exception:
                continue
    else:
        print(f"File not found: {log_path}")
except Exception as e:
    print(f"Error: {e}")
