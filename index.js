window.onload = function() {
    var micTest = null;
    var btnRecord = document.getElementById("btn-record");
    btnRecord.addEventListener("click", function() {
        var audioContext = window.AudioContext // Default
            || window.webkitAudioContext // Safari and old versions of Chrome
            || false;
        micTest = new MicTest(audioContext);
        micTest.record();
        console.log("OK");
    });

    var btnStop = document.getElementById("btn-stop");
    btnStop.addEventListener("click", function() {
        micTest.stopRecording();
    });
    
    var btnListen = document.getElementById("btn-listen");
    btnListen.addEventListener("click", function() {
        micTest.listenRecording();
    });
};
