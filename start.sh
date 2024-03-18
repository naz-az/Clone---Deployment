#!/bin/bash
python3 -m venv venv
source venv/bin/activate
pip3 install -r requirements.txt
gunicorn -k eventlet -w 1 -b 0.0.0.0:3000 app:app --log-file -
