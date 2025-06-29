from flask import Flask, render_template, request, redirect, url_for

app = Flask(__name__)
users = []

@app.route('/')
def index():
    return redirect(url_for('register'))

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username')
        email = request.form.get('email')
        password = request.form.get('password')
        users.append({'username': username, 'email': email})
        return render_template('success.html', username=username)
    return render_template('register.html')

if __name__ == '__main__':
    app.run(debug=True)
