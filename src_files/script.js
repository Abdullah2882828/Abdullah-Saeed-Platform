document.getElementById('downloadBtn').addEventListener('click', async () => {
    const url = document.getElementById('tiktokUrl').value;
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const result = document.getElementById('result');
    const downloadBtn = document.getElementById('downloadBtn');

    if(!url) {
        showError('الرجاء إدخال رابط صحيح');
        return;
    }

    loading.classList.remove('hidden');
    error.classList.add('hidden');
    result.classList.add('hidden');
    downloadBtn.disabled = true;

    try {
        const response = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
        const data = await response.json();
        
        if (data.code === -1 || !data.data) {
            showError('لم يتم العثور على الفيديو. تأكد من الرابط.');
            return;
        }

        const videoData = data.data;
        
        document.getElementById('videoThumb').src = videoData.cover;
        document.getElementById('videoTitle').textContent = videoData.title;
        
        const saveVideoBtn = document.getElementById('saveVideoBtn');
        saveVideoBtn.onclick = () => downloadMedia(videoData.play, 'video.mp4');
        
        const saveAudioBtn = document.getElementById('saveAudioBtn');
        saveAudioBtn.onclick = () => downloadMedia(videoData.music, 'audio.mp3');
        
        result.classList.remove('hidden');
        result.classList.add('flex');

    } catch (err) {
        showError('حدث خطأ في الاتصال بالخادم. ' + err.message);
    } finally {
        loading.classList.add('hidden');
        downloadBtn.disabled = false;
    }
});

function showError(msg) {
    const error = document.getElementById('error');
    error.textContent = msg;
    error.classList.remove('hidden');
}

async function downloadMedia(url, filename) {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
        await window.Capacitor.Plugins.Browser.open({ url: url });
        return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}