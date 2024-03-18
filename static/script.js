let chart;
let dataFetched = [];
let setPoint; // This will be fetched from the backend

const socket = io();  // Connect to WebSocket server


const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const setPointModal = document.getElementById('setPointModal');
const pidModal = document.getElementById('pidModal');
const tfModal = document.getElementById('tfModal');
const setPointBtn = document.getElementById('setPointButton');
const pidBtn = document.getElementById('pidControllerButton');
const tfBtn = document.getElementById('transferFunctionButton');
const closeButtons = document.getElementsByClassName('close');
const ctx = document.getElementById('myChart').getContext('2d');

const mvModal = document.getElementById('mvModal');
const mvValueBtn = document.getElementById('mvValueButton');

const autoButton = document.getElementById('autoButton');
const manualButton = document.getElementById('manualButton');

// startButton.addEventListener('click', () => {
//     fetchSetPoint(); // Fetch setpoint when starting
//     fetch('/start', { method: 'POST' });
//     dataFetched = [];
//     if (!chart) {
//         initializeChart();
//     } else {
//         fetchData();
//     }
// });


// Function to create and initialize the chart
function createChart() {
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Output (y)',
                borderColor: 'blue',
                borderWidth: 1,
                data: [],
            }, {
                label: 'Set Point',
                borderColor: 'green',
                borderWidth: 1,
                borderDash: [10, 5],
                data: [],
                fill: false,
            }]
        },
        options: {
            responsive: true,
            animation: {
                duration: 0
            },
            hover: {
                mode: null
            },
            elements: {
                line: {
                    tension: 0
                },
                point: {
                    radius: 0
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom'
                },
                y: {
                    beginAtZero: false,
                    suggestedMin: 0,
                    suggestedMax: 100
                }
            }
        }
    });
}

// Event listener for the start button
startButton.addEventListener('click', () => {
    fetchSetPoint(); // Fetch setpoint when starting
    fetch('/start', { method: 'POST' }).then(() => {
        if (chart) {
            chart.destroy(); // Destroy the previous chart instance if it exists
        }
        createChart(); // Initialize the chart for the new simulation
        dataFetched = [];
        fetchData(); // Start fetching data for the new simulation
    });
});


stopButton.addEventListener('click', () => {
    fetch('/stop', { method: 'POST' });
});

// stopButton.addEventListener('click', () => {
//     fetch('/stop', { method: 'POST' }).then(() => {
//         if (chart) {
//             chart.data.datasets.forEach((dataset) => {
//                 dataset.data = []; // Clear the data for each dataset
//             });
//             chart.update();
//         }
//     });
// });


setPointBtn.onclick = function() {
    fetch('/setpoint')
        .then(response => response.json())
        .then(data => {
            document.getElementById('setPointValue').value = data.setpoint;
            setPointModal.style.display = "block";
        });
};

pidBtn.onclick = function() {
    fetch('/current_pid')
        .then(response => response.json())
        .then(data => {
            document.getElementById('kpValue').value = data.P;
            document.getElementById('kiValue').value = data.I;
            document.getElementById('kdValue').value = data.D;
            pidModal.style.display = "block";
        });
};

tfBtn.onclick = function() {
    fetch('/current_transfer_function')
        .then(response => response.json())
        .then(data => {
            document.getElementById('numerator').value = data.num.join(', ');
            document.getElementById('denominator').value = data.den.join(', ');
            tfModal.style.display = "block";
        });
};


Array.from(closeButtons).forEach((button) => {
    button.onclick = function() {
        button.parentElement.parentElement.style.display = "none";
    };
});

window.onclick = function(event) {
    if (event.target == setPointModal) {
        setPointModal.style.display = "none";
    }
    if (event.target == pidModal) {
        pidModal.style.display = "none";
    }
    if (event.target == tfModal) {
        tfModal.style.display = "none";
    }
};

document.getElementById('saveSetPoint').addEventListener('click', () => {
    const newSetPoint = document.getElementById('setPointValue').value;
    if (newSetPoint) {
        fetch('/update_setpoint', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ setpoint: newSetPoint }),
        })
        .then(response => response.json())
        .then(data => {
            console.log('Setpoint updated:', data);
            fetchSetPoint(); // Refresh the setpoint value on the chart
            setPointModal.style.display = "none"; // Close the modal
        })
        .catch((error) => {
            console.error('Error:', error);
        });
    }
});

document.getElementById('savePid').addEventListener('click', () => {
    const P = document.getElementById('kpValue').value;
    const I = document.getElementById('kiValue').value;
    const D = document.getElementById('kdValue').value;

    fetch('/update_pid', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ P: P, I: I, D: D }),
    })
    .then(response => response.json())
    .then(data => {
        console.log('PID updated:', data);
        pidModal.style.display = "none";
    })
    .catch((error) => {
        console.error('Error:', error);
    });
});

document.getElementById('saveTf').addEventListener('click', () => {
    const numerator = document.getElementById('numerator').value.split(',').map(num => parseFloat(num.trim()));
    const denominator = document.getElementById('denominator').value.split(',').map(num => parseFloat(num.trim()));

    fetch('/update_transfer_function', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ num: numerator, den: denominator }),
    })
    .then(response => response.json())
    .then(data => {
        console.log('Transfer function updated:', data);
        tfModal.style.display = "none";
    })
    .catch((error) => {
        console.error('Error:', error);
    });
});

function fetchSetPoint() {
    fetch('/setpoint')
        .then(response => response.json())
        .then(data => {
            setPoint = data.setpoint;
            if (chart) {
                updateSetPointLine();
            }
        })
        .catch(error => {
            console.error('Error fetching setpoint:', error);
        });
}

// Fetch data at a faster rate
function fetchData() {
    fetch('/data')
        .then(response => response.json())
        .then(data => {
            if (data.data.length > dataFetched.length) {
                let newDataPoints = data.data.slice(dataFetched.length);
                updateChart(newDataPoints);
            }
            if (chart) {
                // Use requestAnimationFrame to optimize drawing
                requestAnimationFrame(fetchData);
            }
        })
        .catch(error => {
            console.error('Error fetching data:', error);
        });
}

mvValueBtn.onclick = function() {
    fetch('/current_mv')
        .then(response => response.json())
        .then(data => {
            document.getElementById('mvValue').value = data.mv_value;
            mvModal.style.display = "block";
        });
};

document.getElementById('saveMv').addEventListener('click', () => {
    const newMvValue = document.getElementById('mvValue').value;
    if (newMvValue) {
        fetch('/update_mv', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ mv_value: newMvValue }),
        })
        .then(response => response.json())
        .then(data => {
            console.log('MV value updated:', data);
            mvModal.style.display = "none"; // Close the modal
        })
        .catch((error) => {
            console.error('Error:', error);
        });
    }
});

// Close modal when the user clicks anywhere outside of it
window.onclick = function(event) {
    if (event.target == mvModal) {
        mvModal.style.display = "none";
    }
};

// Close modal on clicking 'x'
Array.from(closeButtons).forEach((button) => {
    button.onclick = function() {
        button.parentElement.parentElement.style.display = "none";
    };
});


autoButton.addEventListener('click', () => {
    fetch('/mode', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: 'auto' }),
    })
    .then(response => response.json())
    .then(data => {
        console.log('Mode switched to auto:', data);
    })
    .catch((error) => {
        console.error('Error:', error);
    });
});

manualButton.addEventListener('click', () => {
    fetch('/mode', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: 'manual' }),
    })
    .then(response => response.json())
    .then(data => {
        console.log('Mode switched to manual:', data);
    })
    .catch((error) => {
        console.error('Error:', error);
    });
});

// WebSocket listeners
// socket.on('start_simulation', (data) => {
//     if (data.status === 'started') {
//         fetchSetPoint(); // Fetch setpoint when starting
//         dataFetched = [];
//         if (!chart) {
//             initializeChart();
//         } else {
//             fetchData();
//         }
//     }
// });

// socket.on('start_simulation', (data) => {
//     if (data.status === 'started') {
//         fetchSetPoint(); // Fetch setpoint when starting
//         if (chart) {
//             chart.data.datasets.forEach((dataset) => {
//                 dataset.data = []; // Reset the data for each dataset
//             });
//             chart.update();
//         }
//         dataFetched = [];
//         fetchData(); // Start fetching data for the new simulation
//     }
// });

socket.on('start_simulation', (data) => {
    if (data.status === 'started') {
        fetchSetPoint(); // Fetch setpoint when starting
        if (chart) {
            chart.destroy(); // Destroy the previous chart instance if it exists
        }
        createChart(); // Initialize the chart for the new simulation
        dataFetched = [];
        fetchData(); // Start fetching data for the new simulation
    }
});


socket.on('stop_simulation', (data) => {
    // Do nothing or provide some UI indication that the simulation has stopped
});

// socket.on('stop_simulation', (data) => {
//     if (data.status === 'stopped') {
//         // Optionally clear the chart data here if needed
//         if (chart) {
//             chart.data.datasets.forEach((dataset) => {
//                 dataset.data = [];
//             });
//             chart.update();
//         }
//     }
// });

socket.on('update_pid', (data) => {
    // You can update the PID values in the UI here
    console.log('Updated PID values:', data);

    // Assuming you have input fields with ids 'kpValue', 'kiValue', and 'kdValue' for P, I, and D respectively
    if (data.P !== undefined) {
        document.getElementById('kpValue').value = data.P;
    }
    if (data.I !== undefined) {
        document.getElementById('kiValue').value = data.I;
    }
    if (data.D !== undefined) {
        document.getElementById('kdValue').value = data.D;
    }
});


socket.on('change_setpoint', (data) => {
    setPoint = data.setPoint;
    if (chart) {
        updateSetPointLine();
    }
});


socket.on('mode_change', (data) => {
    console.log('Mode changed to:', data.mode);

    // Update the UI to reflect the mode change
    if (data.mode === 'auto') {
        // Highlight the Auto button or indicate the mode visually
        document.getElementById('autoButton').classList.add('active-mode');
        document.getElementById('manualButton').classList.remove('active-mode');
        console.log('Switched to auto mode');
    } else if (data.mode === 'manual') {
        // Highlight the Manual button or indicate the mode visually
        document.getElementById('manualButton').classList.add('active-mode');
        document.getElementById('autoButton').classList.remove('active-mode');
        console.log('Switched to manual mode');
    }
});

// Event listener for mv value change
socket.on('update_mv', (data) => {
    console.log('Updated MV value:', data.mv_value);
    // Assuming you have an input field with id 'mvValue' for MV value
    document.getElementById('mvValue').value = data.mv_value;
});



function initializeChart() {
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Output (y)',
                borderColor: 'blue',
                borderWidth: 1,
                data: [],
            }, {
                label: 'Set Point',
                borderColor: 'green',
                borderWidth: 1,
                borderDash: [10, 5],
                data: [],
                fill: false,
            }]
        },
        options: {
            responsive: true,
            animation: {
                duration: 0
            },
            hover: {
                mode: null
            },
            elements: {
                line: {
                    tension: 0
                },
                point: {
                    radius: 0
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom'
                },
                y: {
                    beginAtZero: false,
                    suggestedMin: 0,
                    suggestedMax: 100
                }
            }
        }
    });
    fetchData();
}



// Update the updateChart function to reset the dataFetched if a new simulation starts
function updateChart(newData) {
    if (!chart) {
        console.error('The chart has not been initialized.');
        return;
    }
    newData.forEach(point => {
        chart.data.datasets[0].data.push({
            x: point.time,
            y: point.output
        });
        // Append a corresponding setpoint data point
        chart.data.datasets[1].data.push({
            x: point.time,
            y: setPoint
        });
    });
    // Only update the chart if there's new data
    if (newData.length > 0) {
        chart.update();
        dataFetched = [...dataFetched, ...newData];
    }
}

// // Call this function to start the data fetch loop
fetchData();


function updateSetPointLine() {
    chart.data.datasets[1].data = chart.data.datasets[0].data.map(dataPoint => ({
        x: dataPoint.x,
        y: setPoint
    }));
    chart.update();
}