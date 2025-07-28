import csv
import os
import tempfile

from flask import Flask, render_template, request, redirect, url_for
from werkzeug.utils import secure_filename

import pytesseract
from PIL import Image
import pdfplumber

DATA_FILE = 'data.csv'
ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg'}

app = Flask(__name__)


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def parse_table(text):
    rows = []
    for line in text.splitlines():
        parts = line.split()
        if len(parts) >= 5 and parts[0].isdigit():
            cnf = parts[0]
            urna = parts[-1]
            local = parts[-2]
            comparecimento = parts[-3]
            nome = ' '.join(parts[1:-3])
            rows.append([cnf, nome, comparecimento, local, urna])
    return rows


def read_image(path):
    image = Image.open(path)
    text = pytesseract.image_to_string(image, lang='por')
    return text


def read_pdf(path):
    text = ''
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text += page.extract_text() + '\n'
    return text


def save_rows(rows):
    file_exists = os.path.isfile(DATA_FILE)
    with open(DATA_FILE, 'a', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(['CNF', 'Nome', 'Comparecimento', 'Local', 'Urna'])
        writer.writerows(rows)


def load_rows(query=None):
    rows = []
    if not os.path.isfile(DATA_FILE):
        return rows
    with open(DATA_FILE, newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader, None)  # skip header
        for row in reader:
            if query:
                if query.lower() in row[0].lower() or query.lower() in row[1].lower():
                    rows.append(row)
            else:
                rows.append(row)
    return rows


@app.route('/', methods=['GET'])
def index():
    q = request.args.get('q')
    rows = load_rows(q)
    return render_template('index.html', rows=rows)


@app.route('/upload', methods=['POST'])
def upload():
    file = request.files.get('file')
    if not file or not allowed_file(file.filename):
        return redirect(url_for('index'))

    filename = secure_filename(file.filename)
    with tempfile.TemporaryDirectory() as tmpdir:
        path = os.path.join(tmpdir, filename)
        file.save(path)
        ext = filename.rsplit('.', 1)[1].lower()
        if ext == 'pdf':
            text = read_pdf(path)
        else:
            text = read_image(path)

    rows = parse_table(text)
    if rows:
        save_rows(rows)
    return redirect(url_for('index'))


if __name__ == '__main__':
    app.run(debug=True)
