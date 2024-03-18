from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit
import threading

from scipy.integrate import odeint
import numpy as np
import time

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Global variables to control the simulation
simulation_running = False
data = []

# PID parameters
P = 0  # proportional gain
I = 0   # integral gain
D = 0    # derivative gain

# Transfer function parameters
num = [2383]
den = [11900, 1]
set_point = 0

mv_value = 0

mode = "manual"  # Default mode is manual

# Time parameters for simulation with an increased step size for downsampling
t_step = 1  # Adjusted time step for less granularity

# PID controller function
def pid_controller(y, t, set_point, P, I, D, integral, prev_error):
    error = set_point - y
    derivative = (error - prev_error) / t_step
    output = P * error + I * integral + D * derivative
    integral += error * t_step
    prev_error = error
    return output, integral, prev_error

# System dynamics function
def system_dynamics(y, t, u):
    return (u - den[1] * y) / den[0]


import math

def calculate_pv(mv_value):
    if mv_value < 56.9674:
        return 0
    elif mv_value > 77.8173:
        return 100

    a = -0.001177489179674085
    b = 0.32624891774757125
    c = 56.96738095249968 - mv_value

    discriminant = b**2 - 4 * a * c

    if discriminant < 0:
        return None

    pv1 = (-b + math.sqrt(discriminant)) / (2 * a)
    pv2 = (-b - math.sqrt(discriminant)) / (2 * a)

    if 0 <= pv1 <= 100:
        return pv1
    elif 0 <= pv2 <= 100:
        return pv2
    elif pv1 < 0 and pv2 > 100:
        return 0
    elif pv2 < 0 and pv1 > 100:
        return 0
    elif pv1 > 100 and pv2 > 100:
        return 100

def calculate_mv_cubic(pv):
    a = 1.43097425e-06
    b = -0.00139213564
    c = 0.335292689
    d = 56.8729365
    mv = a * pv**3 + b * pv**2 + c * pv + d
    return mv


def start_simulation():
    global simulation_running, data, mode, mv_value
    simulation_running = True
    t = 0
    y = 0
    integral = 0.0
    prev_error = 0.0

    while simulation_running:
        if mode == "auto":
            u, integral, prev_error = pid_controller(y, t, set_point, P, I, D, integral, prev_error)
            y0 = odeint(system_dynamics, y, [t, t + t_step], args=(u,))
            y = y0[1][0]
        else:
            y = calculate_pv(mv_value)
            u = 0

        data_point = {'time': round(t, 2), 'output': round(y, 2), 'control_signal': round(u, 2), 'set_point': set_point}
        data.append(data_point)

        # print(f"Emitting data: {data_point}")
        socketio.emit('sim', {'Time': t, 'PV': y, 'SP': set_point})

        t += t_step
        time.sleep(0.1)

    print("Simulation stopped.")
    socketio.emit('simulation_stopped')
    simulation_running = False


@socketio.on('connect', namespace='/')
def test_connect():
    print('Client connected')

@socketio.on('disconnect', namespace='/')
def test_disconnect():
    print('Client disconnected')


        
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/start', methods=['POST'])
def start():
    global simulation_running, data
    if not simulation_running:
        simulation_running = True  # Make sure to set this flag to True
        data = []  # Clear the data when starting the simulation
        threading.Thread(target=start_simulation).start()
    return '', 204

@app.route('/stop', methods=['POST'])
def stop():
    global simulation_running, data
    simulation_running = False
    # data = []  # Clear the data
    return '', 204


@app.route('/setpoint')
def get_setpoint():
    return jsonify({'setpoint': set_point})

@app.route('/current_pid')
def current_pid():
    return jsonify({'P': P, 'I': I, 'D': D})

@app.route('/current_transfer_function')
def current_transfer_function():
    return jsonify({'num': num, 'den': den})



@app.route('/data')
def get_data():
    global data
    # Ensure data is a list when returning it
    if not isinstance(data, list):
        data = []
    return {'data': data}

from flask import request

@app.route('/update_setpoint', methods=['POST'])
def update_setpoint():
    global set_point
    data = request.get_json()
    set_point = float(data['setpoint'])
    return jsonify({'setpoint': set_point})

@app.route('/update_pid', methods=['POST'])
def update_pid():
    global P, I, D
    data = request.get_json()
    P = float(data['P'])
    I = float(data['I'])
    D = float(data['D'])
    return jsonify({'P': P, 'I': I, 'D': D})

@app.route('/update_transfer_function', methods=['POST'])
def update_transfer_function():
    global num, den
    data = request.get_json()
    num = [float(n) for n in data['num']]
    den = [float(d) for d in data['den']]
    return jsonify({'num': num, 'den': den})

@app.route('/current_mv')
def current_mv():
    return jsonify({'mv_value': mv_value})

@app.route('/update_mv', methods=['POST'])
def update_mv():
    global mv_value
    data = request.get_json()
    mv_value = float(data['mv_value'])
    return jsonify({'mv_value': mv_value})


@app.route('/mode', methods=['GET', 'POST'])
def change_mode():
    global mode, mv_value, data
    if request.method == 'POST':
        data_request = request.get_json()
        new_mode = data_request['mode']
        
        # Check if mode is changing from auto to manual and data is not empty
        if new_mode == "manual" and mode == "auto" and data:
            # Get the last output (pv) from the data
            last_output = data[-1]['output'] if len(data) > 0 else 0
            # Calculate the new mv value based on the last output (pv)
            mv_value = calculate_mv_cubic(last_output)
            # Update the mv_value in the frontend
            socketio.emit('update_mv', {'mv_value': mv_value})

        mode = new_mode
        return jsonify({'mode': mode, 'mv_value': mv_value})


@app.route('/command', methods=['POST'])
def handle_command():
    global simulation_running, set_point, P, I, D, mode, mv_value, data
    command_data = request.get_json()
    command = command_data.get('command', '')

    print(f"Received command: {command}")
    print(f"Simulation running: {simulation_running}")
    print(f"Current simulation data length: {len(data)}")
    print(f"Simulation data: {data}")

    if command == 'start' and not simulation_running:
        simulation_running = True
        data = []  # Clear any previous data
        threading.Thread(target=start_simulation).start()
        socketio.emit('start_simulation', {'status': 'started'})  # Emitting event
        return jsonify({'message': 'Simulation started'}), 200
    elif command == 'stop' and simulation_running:
        simulation_running = False
        data = []
        socketio.emit('stop_simulation', {'status': 'stopped'})
        return jsonify({'message': 'Simulation stopped'}), 200
    elif command == 'changeSetPoint':
        new_set_point = command_data.get('setPoint', None)
        if new_set_point is not None:
            set_point = float(new_set_point)
            socketio.emit('change_setpoint', {'setPoint': set_point})
            return jsonify({'message': 'Set point changed', 'setPoint': set_point}), 200
    elif command == 'updatePID':
        pid_data = {}
        if 'P' in command_data:
            P = float(command_data['P'])
            pid_data['P'] = P
        if 'I' in command_data:
            I = float(command_data['I'])
            pid_data['I'] = I
        if 'D' in command_data:
            D = float(command_data['D'])
            pid_data['D'] = D
        
        if pid_data:
            socketio.emit('update_pid', pid_data)
            return jsonify({'message': 'PID values updated', **pid_data}), 200
        else:
            return jsonify({'message': 'No valid PID values provided'}), 400
    elif command == 'manual':
        if not simulation_running:
            return jsonify({'error': 'Simulation is not running. Start the simulation before switching to manual mode.'}), 400

        mode = 'manual'
        if data:
            last_output = data[-1]['output']
            mv_value = calculate_mv_cubic(last_output)
        else:
            mv_value = 50  # or some other default logic

        socketio.emit('update_mv', {'mv_value': mv_value})
        socketio.emit('mode_change', {'mode': mode})
        return jsonify({'message': 'Mode changed to manual', 'mode': mode, 'mv_value': mv_value}), 200
    elif command == 'auto':
        mode = 'auto'
        socketio.emit('mode_change', {'mode': mode})
        return jsonify({'message': 'Mode changed to auto', 'mode': mode}), 200
    elif command == 'updateConstant':
        constant_value = command_data.get('constantValue', None)
        if constant_value is not None:
            mv_value = float(constant_value)
            socketio.emit('update_mv', {'mv_value': mv_value})
            return jsonify({'message': 'MV value changed', 'mv_value': mv_value}), 200
        else:
            return jsonify({'message': 'Invalid MV value'}), 400
    else:
        return jsonify({'message': 'Invalid command'}), 400


if __name__ == '__main__':
    # socketio.run(app, debug=True)
    socketio.run(app, host='0.0.0.0', port=5000)
