from flask import Flask, render_template, request, jsonify, send_from_directory
import os
import sys
import webbrowser
import threading

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)
sys.path.insert(0, BASE_DIR)
from fill_template import fill_template, fill_carousel, build_rows

app = Flask(__name__, template_folder=BASE_DIR)

@app.route('/')
def index():
    return render_template('glrr-results-formatter.html')

@app.route('/generate', methods=['POST'])
def generate():
    try:
        data = request.get_json()
        pptx_path, png_path = fill_template(data)
        return jsonify({
            'success':  True,
            'filename': os.path.basename(pptx_path),
            'png':      os.path.basename(png_path) if png_path else None
        })
    except Exception as e:
        import traceback
        return jsonify({ 'success': False, 'error': str(e), 'trace': traceback.format_exc() })

@app.route('/process', methods=['POST'])
def process():
    """Run the existing school-restoration + relay/team/individual formatting and
    return finished display rows as JSON. No PowerPoint, no PNG — this feeds the
    browser-rendered (html2canvas) graphic."""
    try:
        data = request.get_json()
        rows = build_rows(data)
        header = {
            'sport':    data.get('sport', ''),
            'division': data.get('division', ''),
            'meet':     data.get('meet', ''),
            'gender':   data.get('gender', ''),
            'event':    data.get('event', ''),
            'type':     data.get('type', data.get('awardtype', 'All-State')),
        }
        return jsonify({ 'success': True, 'rows': rows, 'header': header })
    except Exception as e:
        import traceback
        return jsonify({ 'success': False, 'error': str(e), 'trace': traceback.format_exc() })

@app.route('/generate_carousel', methods=['POST'])
def generate_carousel():
    try:
        data = request.get_json()
        slides = data.get('slides', [])
        results = fill_carousel(slides)
        return jsonify({ 'success': True, 'files': results })
    except Exception as e:
        import traceback
        return jsonify({ 'success': False, 'error': str(e), 'trace': traceback.format_exc() })

@app.route('/download/<filename>')
def download(filename):
    return send_from_directory(BASE_DIR, filename, as_attachment=True)

def open_browser():
    webbrowser.open('http://localhost:5000')

def get_local_ip():
    """Find this computer's local network IP so you can reach it from your phone."""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))  # doesn't actually send anything
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

if __name__ == '__main__':
    local_ip = get_local_ip()
    print("=" * 55)
    print("  GLRR Formatter is running!")
    print(f"  On THIS computer:  http://localhost:5000")
    print(f"  On your PHONE:     http://{local_ip}:5000")
    print("  (phone must be on the same WiFi network)")
    print("=" * 55)
    threading.Timer(1, open_browser).start()
    app.run(host='0.0.0.0', port=5000, debug=False)
