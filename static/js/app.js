// Estado de la aplicación
let appState = {
  modelsLoaded: false,
  registeredUser: null,
  capturedFaceImages: [],
  capturedFaceDescriptors: [],
  captureCount: 0,
  requiredCaptures: 5, // Cambiado de 3 a 5
  forecastChart: null
};

// Elementos del DOM
const elements = {
  nav: {
    register: document.getElementById('nav-register'),
    login: document.getElementById('nav-login'),
    dashboard: document.getElementById('nav-dashboard'),
    logout: document.getElementById('nav-logout')
  },
  sections: {
    register: document.getElementById('register-section'),
    login: document.getElementById('login-section'),
    dashboard: document.getElementById('dashboard-section')
  },
  register: {
    form: document.getElementById('register-form'),
    video: document.getElementById('register-video'),
    canvas: document.getElementById('register-canvas'),
    captureBtn: document.getElementById('capture-face-btn'),
    facesContainer: document.getElementById('face-captures-container'),
    submitBtn: document.getElementById('register-submit-btn'),
    msg: document.getElementById('register-msg')
  },
  login: {
    video: document.getElementById('login-video'),
    canvas: document.getElementById('login-canvas'),
    btn: document.getElementById('login-btn'),
    msg: document.getElementById('login-msg')
  },
  dashboard: {
    userName: document.getElementById('user-name'),
    userEmail: document.getElementById('user-email'),
    chartCtx: document.getElementById('forecast-chart').getContext('2d'),
    speakBtn: document.getElementById('speak-feedback-btn'),
    msg: document.getElementById('dashboard-msg')
  }
};

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadFaceAPIModels();
  checkSession();
});

// Instrucciones de ángulos
function showCaptureInstructions() {
  const instructions = `
    <div class="instructions">
      <h3>Instrucciones para mejores resultados:</h3>
      <div class="angle-instructions">
        <div class="angle-card">
          <h4>1. Vista Frontal</h4>
          <p>Mira directamente a la cámara</p>
        </div>
        <div class="angle-card">
          <h4>2. Ligeramente a la izquierda</h4>
          <p>Gira unos 20-30 grados</p>
        </div>
        <div class="angle-card">
          <h4>3. Ligeramente a la derecha</h4>
          <p>Gira unos 20-30 grados</p>
        </div>
        <div class="angle-card">
          <h4>4. Mirada hacia arriba</h4>
          <p>Inclina la cabeza hacia arriba</p>
        </div>
        <div class="angle-card">
          <h4>5. Mirada hacia abajo</h4>
          <p>Inclina la cabeza hacia abajo</p>
        </div>
      </div>
      <div class="capture-progress" id="capture-progress">
        Progreso: 0 de ${appState.requiredCaptures} capturas
      </div>
    </div>
  `;
  
  const container = document.createElement('div');
  container.id = 'instructions-container';
  container.innerHTML = instructions;
  elements.register.form.insertBefore(container, elements.register.video_container);
}

// Configurar event listeners
function setupEventListeners() {
  // Navegación
  elements.nav.register.onclick = () => {
    showSection('register');
    if (!document.getElementById('instructions-container')) {
      showCaptureInstructions();
    }
  };
  elements.nav.login.onclick = () => showSection('login');
  elements.nav.dashboard.onclick = () => showSection('dashboard');
  elements.nav.logout.onclick = logout;
  
  // Registro
  elements.register.captureBtn.onclick = captureFace;
  elements.register.form.onsubmit = handleRegister;

  // Login
  elements.login.btn.onclick = handleLogin;

  // Dashboard
  elements.dashboard.speakBtn.onclick = speakForecastSummary;

  // Manejo de pestañas (tabs)
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Remover clase active de todos los botones y contenidos
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      // Agregar active al botón clickeado
      btn.classList.add('active');
      
      // Mostrar el contenido correspondiente
      const tabId = btn.getAttribute('data-tab') + '-tab';
      document.getElementById(tabId).classList.add('active');
      
      // Cargar datos según la pestaña
      if (tabId === 'behavior-tab') {
        generateBehaviorCharts();
      }
      // Puedes agregar más condiciones para otras pestañas
    });
  });
}

// Cargar modelos de face-api.js
async function loadFaceAPIModels() {
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('https://justadudewhohacks.github.io/face-api.js/models'),
      faceapi.nets.faceLandmark68Net.loadFromUri('https://justadudewhohacks.github.io/face-api.js/models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('https://justadudewhohacks.github.io/face-api.js/models'),
      faceapi.nets.ssdMobilenetv1.loadFromUri('https://justadudewhohacks.github.io/face-api.js/models')
    ]);

    appState.modelsLoaded = true;
    elements.register.captureBtn.disabled = false;
    elements.login.btn.disabled = false;
    console.log("Modelos de face-api.js cargados.");

    // Iniciar cámaras
    startCamera(elements.register.video);
    startCamera(elements.login.video);
  } catch (error) {
    console.error("Error cargando modelos:", error);
    showMessage(elements.register.msg, "Error cargando funcionalidades faciales", 'error');
  }
}

// Iniciar cámara
async function startCamera(videoElement) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoElement.srcObject = stream;
    return stream;
  } catch (error) {
    console.error("Error accediendo a la cámara:", error);
    showMessage(
      videoElement === elements.register.video ? elements.register.msg : elements.login.msg,
      "Error accediendo a la cámara: " + error.message,
      'error'
    );
    return null;
  }
}

// Capturar rostro para registro
async function captureFace() {
  if (!appState.modelsLoaded) {
    showMessage(elements.register.msg, "Los modelos aún no están cargados", 'error');
    return;
  }

  showMessage(elements.register.msg, "Detectando rostro...");

  try {
    const detections = await faceapi.detectSingleFace(
      elements.register.video,
      new faceapi.TinyFaceDetectorOptions()
    ).withFaceLandmarks().withFaceDescriptor();

    if (!detections) {
      showMessage(elements.register.msg, "No se detectó ningún rostro. Asegúrate de que tu rostro esté bien iluminado y visible.", 'error');
      return;
    }

    // Dibujar imagen capturada
    const ctx = elements.register.canvas.getContext('2d');
    ctx.drawImage(elements.register.video, 0, 0, elements.register.canvas.width, elements.register.canvas.height);
    const imgDataUrl = elements.register.canvas.toDataURL('image/jpeg');

    // Guardar captura
    const captureId = Date.now(); // ID único para cada captura
    appState.capturedFaceImages.push({ id: captureId, url: imgDataUrl });
    appState.capturedFaceDescriptors.push({ id: captureId, descriptor: Array.from(detections.descriptor) });


    // Mostrar miniatura
    addFaceThumbnail(captureId, imgDataUrl);

    // Actualizar estado y progreso
    appState.captureCount++;
    updateCaptureProgress();
    
    // Dar feedback según el progreso
    if (appState.captureCount === 1) {
      speakText("Excelente. Ahora gira ligeramente a tu izquierda para la siguiente captura.");
    } else if (appState.captureCount === 2) {
      speakText("Muy bien. Ahora gira a tu derecha, por favor.");
    } else if (appState.captureCount === 3) {
      speakText("Perfecto. Ahora mira ligeramente hacia arriba.");
    } else if (appState.captureCount === 4) {
      speakText("Casi terminamos. Por último, mira ligeramente hacia abajo.");
    }

    if (appState.captureCount >= appState.requiredCaptures) {
      elements.register.captureBtn.disabled = true;
      elements.register.submitBtn.disabled = false;
      showMessage(elements.register.msg, "¡Capturas completadas! Ahora puedes registrarte.", 'success');
      speakText("Capturas completadas. Por favor revisa que todas las imágenes sean claras antes de registrar.");
    } else {
      showMessage(
        elements.register.msg,
        `Captura ${appState.captureCount} de ${appState.requiredCaptures} realizada. Por favor cambia tu ángulo.`,
        'info'
      );
    }
  } catch (error) {
    console.error("Error capturando rostro:", error);
    showMessage(elements.register.msg, "Error capturando rostro. Intenta de nuevo.", 'error');
  }
}

function updateCaptureProgress() {
  const progressElement = document.getElementById('capture-progress');
  if (progressElement) {
    progressElement.textContent = `Progreso: ${appState.captureCount} de ${appState.requiredCaptures} capturas`;
    
    // Cambiar color según el progreso
    if (appState.captureCount >= appState.requiredCaptures) {
      progressElement.style.color = 'green';
    } else {
      progressElement.style.color = appState.captureCount > 0 ? 'orange' : 'var(--primary-color)';
    }
  }
}

// Manejar registro de usuario
async function handleRegister(e) {
  e.preventDefault();

  if (appState.captureCount < appState.requiredCaptures) {
    showMessage(elements.register.msg, `Debes capturar al menos ${appState.requiredCaptures} imágenes`, 'error');
    return;
  }

  const formData = new FormData();
  formData.append('name', document.getElementById('name').value.trim());
  formData.append('lastname', document.getElementById('lastname').value.trim());
  formData.append('email', document.getElementById('email').value.trim());
  formData.append('cedula', document.getElementById('cedula').value.trim());
  formData.append('password', document.getElementById('password').value);

  // Agregar todas las imágenes capturadas
  appState.capturedFaceImages.forEach((img, index) => {
    const blob = dataURLtoBlob(img.url);
    formData.append(`file`, blob, `face_${index}.jpg`);
  });

  try {
    elements.register.submitBtn.disabled = true;
    showMessage(elements.register.msg, "Registrando usuario...", 'info');
    
    const response = await fetch('/api/register', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (response.ok) {
      showMessage(elements.login.msg, result.message, 'success');
      appState.registeredUser = result.user;
      
      // Mensaje de bienvenida por voz
      const welcomeMessage = `¡Bienvenido ${result.user.name}! Has iniciado sesión correctamente.`;
      speakText(welcomeMessage);
      
      updateUserInfo();
      showSection('dashboard');
      generateForecastChart();
    } else {
      // Muestra el mensaje de error específico del backend
      showMessage(elements.register.msg, result.message, 'error');
    }
  } catch (error) {
    console.error("Error en registro:", error);
    showMessage(elements.register.msg, "Error de conexión", 'error');
  } finally {
    elements.register.submitBtn.disabled = false;
  }
}

async function handleLogin() {
  try {
    // Capturar imagen del video
    const canvas = document.createElement('canvas');
    canvas.width = elements.login.video.videoWidth;
    canvas.height = elements.login.video.videoHeight;
    canvas.getContext('2d').drawImage(elements.login.video, 0, 0, canvas.width, canvas.height);
    const imageBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));

    const formData = new FormData();
    formData.append('file', imageBlob, 'login_face.jpg');

    showMessage(elements.login.msg, "Verificando tu identidad...", 'info');

    const response = await fetch('/api/login', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (response.ok) {
      showMessage(elements.login.msg, result.message, 'success');
      appState.registeredUser = result.user;
      
      // Mensaje de bienvenida por voz
      const welcomeMessage = `¡Bienvenido ${result.user.name}! Has iniciado sesión correctamente.`;
      speakText(welcomeMessage);
      
      updateUserInfo();
      showSection('dashboard');
      generateForecastChart();
    } else {
      showMessage(
        elements.login.msg,
        result.message,
        'error'
      );
    }
  } catch (error) {
    console.error("Error en login:", error);
    showMessage(elements.login.msg, "Error de conexión", 'error');
  }
}

// Verificar sesión
async function checkSession() {
  try {
    const response = await fetch('/api/user');
    const data = await response.json();
    
    if (!response.ok) {
      if (response.status === 401) {
        console.log("Sesión no válida o expirada");
        return;
      }
      throw new Error(data.message || 'Error verificando sesión');
    }

    if (data.status === 'success') {
      appState.registeredUser = data.user;
      updateUserInfo();
      showSection('dashboard');
      generateForecastChart();
      elements.nav.logout.classList.remove('hidden');
    }
  } catch (error) {
    console.error("Error verificando sesión:", error);
  }
}

// Función auxiliar para convertir dataURL a Blob
function dataURLtoBlob(dataURL) {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

// Cerrar sesión
async function logout() {
  try {
    await fetch('/logout');
    appState.registeredUser = null;
    showSection('login');
    elements.nav.logout.classList.add('hidden');
  } catch (error) {
    console.error("Error cerrando sesión:", error);
  }
}

// Mostrar sección
function showSection(section) {
  // Ocultar todas las secciones
  Object.values(elements.sections).forEach(sec => sec.classList.add('hidden'));
  Object.values(elements.nav).forEach(btn => btn.classList.remove('active'));

  // Mostrar sección solicitada
  switch (section) {
    case 'register':
      elements.sections.register.classList.remove('hidden');
      elements.nav.register.classList.add('active');
      break;
    case 'login':
      elements.sections.login.classList.remove('hidden');
      elements.nav.login.classList.add('active');
      break;
    case 'dashboard':
      elements.sections.dashboard.classList.remove('hidden');
      elements.nav.dashboard.classList.add('active');
      elements.nav.logout.classList.remove('hidden');
      break;
  }
}

// Actualizar información de usuario
function updateUserInfo() {
  if (appState.registeredUser) {
    elements.dashboard.userName.textContent = appState.registeredUser.name;
    elements.dashboard.userEmail.textContent = appState.registeredUser.email;
  }
}

// Generar gráfico de pronóstico
async function generateForecastChart() {
  try {
    showMessage(elements.dashboard.msg, "Cargando datos...", 'info');
    
    const response = await fetch('/api/forecast');
    const data = await response.json();

    if (!response.ok) throw new Error(data.message);

    // Destruir gráfico anterior si existe
    if (appState.forecastChart) {
      appState.forecastChart.destroy();
    }

    // Crear nuevo gráfico
    appState.forecastChart = new Chart(elements.dashboard.chartCtx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: 'Datos Reales',
            data: data.real_data,
            borderColor: '#1E6BA2',  // Azul principal
            backgroundColor: 'rgba(30, 107, 162, 0.3)', // Azul con transparencia
            spanGaps: true,
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            borderWidth: 2
          },
          {
            label: 'Pronóstico',
            data: data.forecast_data,
            borderColor: '#BE8B09',  // Dorado/accent
            backgroundColor: 'rgba(190, 139, 9, 0.3)', // Dorado con transparencia
            spanGaps: true,
            fill: true,
            borderDash: [6, 6],
            tension: 0.4,
            pointRadius: 3,
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top' },
          tooltip: { mode: 'index', intersect: false },
          title: {
            display: true,
            text: 'Predicción de Datos - Próximos 30 días',
            font: { size: 18, weight: 'bold' }
          }
        },
        interaction: { mode: 'nearest', intersect: false },
        scales: {
          y: { beginAtZero: false, ticks: { stepSize: 10 } }
        }
      }
    });

    showMessage(elements.dashboard.msg, "Datos cargados correctamente", 'success');
  } catch (error) {
    console.error("Error generando gráfico:", error);
    showMessage(elements.dashboard.msg, "Error cargando datos", 'error');
  }
}

// Hablar resumen del pronóstico
function speakForecastSummary() {
  if (!appState.forecastChart) return;

  const utterance = new SpeechSynthesisUtterance();
  utterance.lang = 'es-ES';

  const realData = appState.forecastChart.data.datasets[0].data.filter(n => n !== null);
  const forecastData = appState.forecastChart.data.datasets[1].data.filter(n => n !== null);
  const lastReal = realData[realData.length - 1];
  const forecastAvg = forecastData.reduce((a, b) => a + b, 0) / forecastData.length;

  utterance.text = `En los últimos ${realData.length} días, el valor final fue ${lastReal}. ` +
    `El pronóstico para los próximos ${forecastData.length} días indica un promedio de ${forecastAvg.toFixed(2)}. ` +
    `Gracias por usar el dashboard inteligente.`;

  speechSynthesis.speak(utterance);
}

// Mostrar mensaje
function showMessage(element, text, type = 'info') {
  element.textContent = text;
  element.className = 'message';
  
  if (type === 'success') element.classList.add('success');
  if (type === 'error') element.classList.add('error');
}

// Función para hablar texto
function speakText(text, lang = 'es-ES') {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance();
    utterance.text = text;
    utterance.lang = lang;
    utterance.volume = 1; // 0 a 1
    utterance.rate = 1; // 0.1 a 10
    utterance.pitch = 1; // 0 a 2
    
    // Detener cualquier voz previa
    window.speechSynthesis.cancel();
    
    // Hablar el texto
    window.speechSynthesis.speak(utterance);
  } else {
    console.warn("Tu navegador no soporta la síntesis de voz");
  }
}

function addFaceThumbnail(id, imgDataUrl) {
  const thumbnailContainer = document.createElement('div');
  thumbnailContainer.className = 'face-thumbnail';
  thumbnailContainer.dataset.id = id;

  const imgElement = document.createElement('img');
  imgElement.src = imgDataUrl;

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-face-btn';
  deleteBtn.innerHTML = '×';
  deleteBtn.title = 'Eliminar esta captura';
  deleteBtn.onclick = () => removeFaceCapture(id);

  thumbnailContainer.appendChild(imgElement);
  thumbnailContainer.appendChild(deleteBtn);
  elements.register.facesContainer.appendChild(thumbnailContainer);
}

function removeFaceCapture(id) {
  // Eliminar de los arrays de estado
  appState.capturedFaceImages = appState.capturedFaceImages.filter(img => img.id !== id);
  appState.capturedFaceDescriptors = appState.capturedFaceDescriptors.filter(desc => desc.id !== id);
  
  // Actualizar el contador
  appState.captureCount = appState.capturedFaceImages.length;
  
  // Eliminar el elemento del DOM
  const thumbnail = document.querySelector(`.face-thumbnail[data-id="${id}"]`);
  if (thumbnail) {
    thumbnail.remove();
  }
  
  // Actualizar interfaz
  updateCaptureProgress();
  elements.register.captureBtn.disabled = false;
  elements.register.submitBtn.disabled = appState.captureCount < appState.requiredCaptures;
  
  showMessage(elements.register.msg, `Captura eliminada. Te quedan ${appState.captureCount} de ${appState.requiredCaptures} capturas necesarias.`, 'info');
  
  // Dar feedback de voz
  speakText(`Captura eliminada. Puedes tomar una nueva.`);
}

// Generar gráficos de comportamiento de usuario
async function generateBehaviorCharts() {
  try {
    // Obtener datos del servidor
    const [behaviorRes, usageRes] = await Promise.all([
      fetch('/api/user_behavior'),
      fetch('/api/system_usage')
    ]);
    
    const behaviorData = await behaviorRes.json();
    const usageData = await usageRes.json();
    
    if (!behaviorRes.ok || !usageRes.ok) {
      throw new Error('Error al cargar datos');
    }
    
    // 1. Gráfico de frecuencia de logins
    const loginFrequencyCtx = document.getElementById('login-frequency-chart').getContext('2d');
    new Chart(loginFrequencyCtx, {
      type: 'bar',
      data: {
        labels: behaviorData.login_frequency.map(item => item.day),
        datasets: [{
          label: 'Logins por día',
          data: behaviorData.login_frequency.map(item => item.count),
          backgroundColor: 'rgba(30, 107, 162, 0.7)',  // Azul semitransparente
          borderColor: '#1E6BA2',  // Azul sólido para el borde
          borderWidth: 1,
          hoverBackgroundColor: 'rgba(190, 139, 9, 0.8)',  // Dorado al hacer hover
          hoverBorderColor: '#FFFFFF',  // Borde blanco al hacer hover
          borderRadius: 4,  // Esquinas ligeramente redondeadas
          borderSkipped: false,  // Bordes en todos los lados de la barra
          categoryPercentage: 0.8,  // Control del ancho de las barras
          barPercentage: 0.9
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: 'Frecuencia de Logins (últimos 30 días)' }
        }
      }
    });
    
    // 2. Gráfico de horarios de acceso
    const loginHoursCtx = document.getElementById('login-hours-chart').getContext('2d');
    new Chart(loginHoursCtx, {
      type: 'line',
      data: {
        labels: Array.from({length: 24}, (_, i) => `${i}:00`),
        datasets: [{
          label: 'Accesos por hora',
          data: behaviorData.login_hours,
          backgroundColor: 'rgba(30, 107, 162, 0.2)', // Azul con transparencia
          borderColor: '#1E6BA2', // Azul sólido
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          pointBackgroundColor: '#BE8B09', // Dorado para los puntos
          pointBorderColor: '#FFFFFF', // Borde blanco para los puntos
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: 'Distribución de Accesos por Hora' }
        }
      }
    });
    
    // 3. Gráfico de precisión de reconocimiento
    const accuracyCtx = document.getElementById('accuracy-chart').getContext('2d');
    new Chart(accuracyCtx, {
      type: 'doughnut',
      data: {
        labels: ['Éxito', 'Fallo'],
        datasets: [{
          data: [
            behaviorData.recognition_accuracy.success, 
            behaviorData.recognition_accuracy.failure
          ],
          backgroundColor: [
            '#1E6BA2',  // Azul para los éxitos
            '#BE8B09'   // Dorado para los fallos
          ],
          borderColor: [
            '#FFFFFF',  // Borde blanco para el azul
            '#FFFFFF'   // Borde blanco para el dorado
          ],
          borderWidth: 2,
          hoverBackgroundColor: [
            'rgba(30, 107, 162, 0.8)',  // Azul más oscuro al hacer hover
            'rgba(190, 139, 9, 0.8)'    // Dorado más oscuro al hacer hover
          ],
          hoverBorderColor: [
            '#FFFFFF',  // Borde blanco al hacer hover
            '#FFFFFF'   // Borde blanco al hacer hover
          ]
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: 'Precisión de Reconocimiento Facial' }
        }
      }
    });
    
    // 4. Gráfico de distribución de similitud
    const similarityCtx = document.getElementById('similarity-chart').getContext('2d');
    new Chart(similarityCtx, {
      type: 'bar',  // Cambiado de 'histogram' a 'bar'
      data: {
        labels: Array.from({length: behaviorData.similarity_distribution.length}, (_, i) => (i+1)),
        datasets: [{
          label: 'Distancia facial',
          data: behaviorData.similarity_distribution,
          backgroundColor: 'rgba(30, 107, 162, 0.7)',  // Azul semitransparente
          borderColor: '#1E6BA2',  // Azul sólido para el borde
          borderWidth: 1,
          hoverBackgroundColor: '#BE8B09',  // Dorado al hacer hover
          hoverBorderColor: '#FFFFFF',  // Borde blanco al hacer hover
          barPercentage: 0.9,  // Ancho de las barras (90% del espacio disponible)
          categoryPercentage: 0.8  // Espacio entre categorías
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: 'Distribución de Similitud Facial' }
        },
        scales: {
          x: {
            title: { display: true, text: 'Intento' }
          },
          y: {
            title: { display: true, text: 'Distancia' }
          }
        }
      }
    });
    
    // 5. Gráfico de uso del sistema
    const usageCtx = document.getElementById('system-usage-chart').getContext('2d');
    new Chart(usageCtx, {
      type: 'line',
      data: {
        labels: usageData.labels,
        datasets: [{
          label: 'Uso del sistema',
          data: usageData.usage_data,
          backgroundColor: 'rgba(30, 107, 162, 0.2)', // Azul con transparencia
          borderColor: '#1E6BA2', // Azul sólido
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          pointBackgroundColor: '#BE8B09', // Dorado para los puntos
          pointBorderColor: '#FFFFFF', // Borde blanco para los puntos
          pointRadius: 4,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#1E6BA2', // Azul al hacer hover
          pointHoverBorderColor: '#FFFFFF' // Borde blanco al hacer hover
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: 'Uso del Sistema (últimos 30 días)' }
        }
      }
    });
    
  } catch (error) {
    console.error("Error generando gráficos:", error);
    showMessage(elements.dashboard.msg, "Error cargando datos de comportamiento", 'error');
  }
}

// Actualiza la función checkSession para incluir los nuevos gráficos
async function checkSession() {
  try {
    const response = await fetch('/api/user');
    const data = await response.json();
    
    if (!response.ok) {
      if (response.status === 401) {
        console.log("Sesión no válida o expirada");
        return;
      }
      throw new Error(data.message || 'Error verificando sesión');
    }

    if (data.status === 'success') {
      appState.registeredUser = data.user;
      updateUserInfo();
      showSection('dashboard');
      generateForecastChart();
      generateBehaviorCharts(); // <- Nueva línea para cargar los nuevos gráficos
      elements.nav.logout.classList.remove('hidden');
    }
  } catch (error) {
    console.error("Error verificando sesión:", error);
  }
}