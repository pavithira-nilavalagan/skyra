const apiKey = '48f5359c843bb68df76720cbfee1ff9d';
let myChart, markerLayer;
const map = L.map('map', {attributionControl:false}).setView([20.5937,78.9629],5);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
markerLayer = L.layerGroup().addTo(map);

const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const saveFavBtn = document.getElementById('saveFav');
const favDiv = document.getElementById('favCities');
const themeBtn = document.getElementById('themeToggle');
const voiceBtn = document.getElementById('voiceBtn');
const locBtn = document.getElementById('locBtn');

searchBtn.addEventListener('click', ()=>getWeather());
cityInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') getWeather(); });
saveFavBtn.addEventListener('click', saveFavorite);
themeBtn.addEventListener('click', ()=>{ document.body.classList.toggle('dark'); themeBtn.setAttribute('aria-pressed', document.body.classList.contains('dark')); });

voiceBtn.addEventListener('click', () => {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) return alert('Speech recognition not supported in this browser');

  const rec = new Speech();
  rec.lang = 'en-US';
  rec.interimResults = false; // only final result
  rec.maxAlternatives = 1;

  // Provide feedback to user
  voiceBtn.textContent = "🎤 Listening...";

  rec.start();

  rec.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    cityInput.value = transcript;
    getWeather();
  };

  rec.onerror = (e) => {
    alert("Voice recognition error: " + e.error);
    console.error(e);
  };

  rec.onend = () => {
    // Reset button text when done
    voiceBtn.textContent = "🎤";
  };
});


// Current Location Weather
locBtn.addEventListener('click', ()=>{
  if(!navigator.geolocation) return alert('Geolocation not supported');
  navigator.geolocation.getCurrentPosition(pos=>{
    getWeatherByCoords(pos.coords.latitude,pos.coords.longitude);
  });
});

function loadFavorites() {
    const list = JSON.parse(localStorage.getItem("fav")) || [];
    favDiv.innerHTML = list.length
        ? list.map(c => `<button class="tag" onclick="getWeather('${c.replace(/'/g, "\\'")}')">${c}</button>`).join("")
        : '<p class="small">No favorites yet</p>';

    // Update heart state
    const currentCity = cityInput.value.trim();
    saveFavBtn.textContent = list.includes(currentCity) ? "💔" : "❤️";
    saveFavBtn.classList.toggle("active", list.includes(currentCity));
}

function saveFavorite() {
    const city = cityInput.value.trim();
    if (!city) return alert("Search a city first.");

    let favs = JSON.parse(localStorage.getItem("fav")) || [];

    if (favs.includes(city)) {
        // Remove city
        favs = favs.filter(c => c !== city);
        saveFavBtn.textContent = "❤️"; // change to add
        saveFavBtn.classList.remove("active");
    } else {
        // Add city
        favs.push(city);
        saveFavBtn.textContent = "💔"; // change to remove
        saveFavBtn.classList.add("active");
    }

    localStorage.setItem("fav", JSON.stringify(favs));
    loadFavorites();
}


async function getWeather(cityFromTag){
  const city = (cityFromTag || cityInput.value).trim();
  if(!city) return alert('Please enter a city name');
  setLoading(true);
  try{
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('City not found');
    const data = await res.json();
    displayWeather(data);
    await getForecast(city);
    markerLayer.clearLayers();
    L.marker([data.coord.lat,data.coord.lon]).addTo(markerLayer);
    map.setView([data.coord.lat,data.coord.lon],10);
    await getWeatherAlerts(data.coord.lat,data.coord.lon);
  }catch(err){ alert('Error: '+err.message); }
  finally{ setLoading(false); }
}

async function getWeatherByCoords(lat,lon){
  setLoading(true);
  try{
    const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`);
    const data = await res.json();
    cityInput.value = data.name;
    displayWeather(data);
    await getForecast(data.name);
    markerLayer.clearLayers();
    L.marker([lat,lon]).addTo(markerLayer);
    map.setView([lat,lon],10);
    await getWeatherAlerts(lat,lon);
  }catch(err){ alert('Error: '+err.message);}
  finally{ setLoading(false);}
}

// Display current weather
function displayWeather(data){
    document.getElementById('weatherDisplay').innerHTML = `
        <h2>${data.name}, ${data.sys?.country||''}</h2>
        <p class="small">${data.weather[0].description}</p>
        <h1>${Math.round(data.main.temp)}°C</h1>
        <img alt="weather icon" src="https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png">
        <div class="details">
            <p class="humidity">Humidity: <span id="humidity">${data.main.humidity}%</span></p>
            <p class="wind">Wind: <span id="wind">${data.wind.speed} km/h</span></p>
        </div>
    `;
    
    // Weather animation
    updateWeatherEffect(data.weather[0].icon);

    // Update sunrise & sunset
    displaySunTimes(data);
}

// Forecast
async function getForecast(city){
  const fRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`);
  const fData = await fRes.json();
  const container = document.getElementById('forecastContainer');
  container.innerHTML='';
  const byDay={};
  fData.list.forEach(item=>{
    const day=item.dt_txt.split(' ')[0];
    const time=item.dt_txt.split(' ')[1];
    if(!byDay[day] || Math.abs(parseInt(time.split(':')[0])-12)<Math.abs(parseInt(byDay[day].dt_txt.split(' ')[1].split(':')[0])-12))
      byDay[day]=item;
  });
  const days=Object.keys(byDay).slice(0,5);
  const temps=[];
  days.forEach(d=>{
    const day=byDay[d]; const desc=day.weather[0].description; temps.push(Math.round(day.main.temp));
    container.insertAdjacentHTML('beforeend',`
      <div class="forecast-card">
        <div class="small">${d}</div>
        <img alt="icon" src="https://openweathermap.org/img/wn/${day.weather[0].icon}.png">
        <div><strong>${Math.round(day.main.temp)}°C</strong></div>
        <p class="small">${desc}</p>
      </div>
    `);
  });
  drawChart(temps);
}

// Temperature chart
function drawChart(temps){
  const ctx = document.getElementById('tempChart');
  if(myChart) myChart.destroy();
  myChart=new Chart(ctx,{
    type:'line',
    data:{labels:temps.map((_,i)=>`Day ${i+1}`),datasets:[{label:'Temperature (°C)',data:temps,borderWidth:2,fill:false}]},
    options:{responsive:true,plugins:{legend:{display:false}}}
  });
}

// Weather Alerts
async function getWeatherAlerts(lat,lon){
  try{
    const res = await fetch(`https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly,daily&appid=${apiKey}`);
    const data = await res.json();
    const alerts = data.alerts || [];
    const badge = document.getElementById('alertBadge');
    if(alerts.length>0){
      badge.style.display='block';
      badge.textContent='⚠ '+alerts[0].event;
    }else{badge.style.display='none';}
  }catch(e){console.warn('Alert error',e);}
}

// Live background animation
setInterval(()=>{
  const hour=new Date().getHours();
  if(hour>=6 && hour<18) document.body.style.background='linear-gradient(135deg,#4c6ef5,#b197fc)';
  else document.body.style.background='linear-gradient(135deg,#0b0c1f,#2c2c4c)';
},5000);

function setLoading(on){
  searchBtn.disabled=on;
  searchBtn.textContent=on?'Loading...':'Search';
}

// Set up the canvas overlay
const weatherCanvas = document.getElementById('weatherCanvas');
const ctx = weatherCanvas.getContext('2d');

function resizeCanvas(){
  weatherCanvas.width = window.innerWidth;
  weatherCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Particle arrays
let rainDrops = [], snowFlakes = [], fogParticles = [], lightning = [];

// Initialize particles
function initWeatherEffect(type){
  const w = weatherCanvas.width;
  const h = weatherCanvas.height;

  if(type==='rain'){
    rainDrops = [];
    for(let i=0;i<150;i++){
      rainDrops.push({x:Math.random()*w, y:Math.random()*h, l:Math.random()*20+10, xs:-2+Math.random()*4, ys:4+Math.random()*4});
    }
  }
  if(type==='snow'){
    snowFlakes=[];
    for(let i=0;i<120;i++){
      snowFlakes.push({x:Math.random()*w, y:Math.random()*h, r:Math.random()*4+1, d:Math.random()*1});
    }
  }
  if(type==='fog'){
    fogParticles=[];
    for(let i=0;i<80;i++){
      fogParticles.push({x:Math.random()*w, y:Math.random()*h, r:Math.random()*60+40, alpha:Math.random()*0.3+0.1});
    }
  }
}

// Draw functions
function drawRain(){
  ctx.clearRect(0,0,weatherCanvas.width,weatherCanvas.height);
  ctx.strokeStyle = 'rgba(174,194,224,0.5)';
  ctx.lineWidth=1;
  ctx.beginPath();
  for(let i=0;i<rainDrops.length;i++){
    let r=rainDrops[i];
    ctx.moveTo(r.x,r.y);
    ctx.lineTo(r.x+r.xs,r.y+r.l);
  }
  ctx.stroke();
  moveRain();
}

function moveRain(){
  for(let i=0;i<rainDrops.length;i++){
    let r=rainDrops[i];
    r.x += r.xs;
    r.y += r.ys;
    if(r.y>weatherCanvas.height){ r.y = -20; r.x = Math.random()*weatherCanvas.width; }
    if(r.x>weatherCanvas.width || r.x<0){ r.x = Math.random()*weatherCanvas.width; }
  }
}

function drawSnow(){
  ctx.clearRect(0,0,weatherCanvas.width,weatherCanvas.height);
  ctx.fillStyle='rgba(255,255,255,0.8)';
  ctx.beginPath();
  for(let i=0;i<snowFlakes.length;i++){
    let f=snowFlakes[i];
    ctx.moveTo(f.x,f.y);
    ctx.arc(f.x,f.y,f.r,0,Math.PI*2,true);
  }
  ctx.fill();
  moveSnow();
}

function moveSnow(){
  for(let i=0;i<snowFlakes.length;i++){
    let f=snowFlakes[i];
    f.y += Math.pow(f.d+1,0.5);
    f.x += Math.sin(f.y*0.01)*2;
    if(f.y>weatherCanvas.height){ f.y=0; f.x=Math.random()*weatherCanvas.width; }
  }
}

function drawFog(){
  ctx.clearRect(0,0,weatherCanvas.width,weatherCanvas.height);
  for(let i=0;i<fogParticles.length;i++){
    let f=fogParticles[i];
    ctx.fillStyle=`rgba(200,200,200,${f.alpha})`;
    ctx.beginPath();
    ctx.arc(f.x,f.y,f.r,0,Math.PI*2);
    ctx.fill();
    f.x += Math.random()*0.5-0.25;
    if(f.x>weatherCanvas.width) f.x=0;
  }
}

function drawThunder(){
  ctx.clearRect(0,0,weatherCanvas.width,weatherCanvas.height);
  if(Math.random()<0.02){
    ctx.fillStyle='rgba(255,255,255,0.8)';
    ctx.fillRect(0,0,weatherCanvas.width,weatherCanvas.height);
  }
}

// Animate
let weatherType=''; // 'rain','snow','fog','thunder','clear'
function animateWeather(){
  requestAnimationFrame(animateWeather);
  if(weatherType==='rain') drawRain();
  else if(weatherType==='snow') drawSnow();
  else if(weatherType==='fog') drawFog();
  else if(weatherType==='thunder') drawThunder();
  else ctx.clearRect(0,0,weatherCanvas.width,weatherCanvas.height);
}

// Call this to set the effect
function setWeatherEffect(type){
  weatherType=type;
  initWeatherEffect(type);
}

animateWeather();

// Example: connect with actual weather icon codes
function updateWeatherEffect(icon){
  if(icon.startsWith('09') || icon.startsWith('10')) setWeatherEffect('rain'); // rain
  else if(icon.startsWith('13')) setWeatherEffect('snow'); // snow
  else if(icon.startsWith('50')) setWeatherEffect('fog'); // mist/fog
  else if(icon.startsWith('11')) setWeatherEffect('thunder'); // thunderstorm
  else setWeatherEffect('clear'); // clear
}

// Call updateWeatherEffect in your displayWeather function
// Example:
// displayWeather(data){
//   ...
//   updateWeatherEffect(data.weather[0].icon);
// }



function displaySunTimes(data){
    if(!data?.sys) return;

    function formatTime(unix){
        const date = new Date(unix * 1000);
        let h = date.getHours();
        let m = date.getMinutes();
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        m = m < 10 ? '0' + m : m;
        return `${h}:${m} ${ampm}`;
    }

    document.getElementById("sunriseBox").textContent =
        `🌅Sunrise: ${formatTime(data.sys.sunrise)}`;

    document.getElementById("sunsetBox").textContent =
        `🌇Sunset: ${formatTime(data.sys.sunset)}`;
}




function resizeCanvas(){
    weatherCanvas.width = window.innerWidth;
    weatherCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
