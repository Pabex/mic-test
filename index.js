window.onload = function() {
    var micTest = null;
    var btnRecord = document.getElementById("btn-record");
    var btnStop = document.getElementById("btn-stop");
    var btnListen = document.getElementById("btn-listen");
    
    function finishedRecording() {
        btnRecord.removeAttribute("disabled");
        btnStop.setAttribute("disabled", "disabled");
        btnListen.removeAttribute("disabled");
        console.log("Se terminó de grabar.");
    }
    
    btnRecord.addEventListener("click", function() {
        var audioContext = window.AudioContext // Default
            || window.webkitAudioContext // Safari and old versions of Chrome
            || false;
        micTest = new MicTest(audioContext);
        btnRecord.setAttribute("disabled", "disabled");
        btnStop.removeAttribute("disabled");
        btnListen.setAttribute("disabled", "disabled");
        micTest.record(function() {
            finishedRecording();
        });
    });

    btnStop.addEventListener("click", function() {
        micTest.stopRecording();
        finishedRecording();
    });
    
    btnListen.addEventListener("click", function() {
        btnRecord.setAttribute("disabled", "disabled");
        micTest.listenRecording(function() {
            btnRecord.removeAttribute("disabled");
        });
    });
};
