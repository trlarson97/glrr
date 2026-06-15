import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
print(f"BASE_DIR: {BASE_DIR}")
print(f"templates folder exists: {os.path.exists(os.path.join(BASE_DIR, 'templates'))}")
print(f"michigan.pptx exists: {os.path.exists(os.path.join(BASE_DIR, 'templates', 'michigan.pptx'))}")
print(f"\nFiles in BASE_DIR:")
for f in os.listdir(BASE_DIR):
    print(f"  {f}")
print(f"\nFiles in templates folder (if exists):")
templates_path = os.path.join(BASE_DIR, 'templates')
if os.path.exists(templates_path):
    for f in os.listdir(templates_path):
        print(f"  {f}")
