/*
 *  Copyright (c) 2014 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */
function MicTest(audioContext, callbackExito, callbackError) {
    this.audioContext = audioContext;
    this.error = false;
    this.inputChannelCount = 6;
    this.outputChannelCount = 2;
    this.callbackExito = callbackExito;
    this.callbackError = callbackError;

    this.audio = null;
    this.mediaRecorder = null;
    this.timeoutRecordId = null;

    // Buffer size set to 0 to let Chrome choose based on the platform.
    this.bufferSize = 0;
    // Turning off echoCancellation constraint enables stereo input.
    this.constraints = {
        audio: {
            /*optional: [
                {echoCancellation: false}
            ]*/
        }
    };

    this.collectSeconds = 2.0;
    // At least one LSB 16-bit data (compare is on absolute value).
    this.silentThreshold = 1.0 / 32767;
    this.lowVolumeThreshold = -60;
    // Data must be identical within one LSB 16-bit to be identified as mono.
    this.monoDetectThreshold = 1.0 / 65536;
    // Number of consequtive clipThreshold level samples that indicate clipping.
    this.clipCountThreshold = 6;
    this.clipThreshold = 1.0;

    // Populated with audio as a 3-dimensional array:
    //   collectedAudio[channels][buffers][samples]
    this.collectedAudio = [];
    this.collectedSampleCount = 0;
    for (var i = 0; i < this.inputChannelCount; ++i) {
        this.collectedAudio[i] = [];
    }
}

MicTest.prototype = {
    record: function () {
        if (typeof this.audioContext === 'undefined') {
            this.error = true;
            console.log('WebAudio is not supported, test cannot run.');
        } else {
            var object = this;
            navigator.mediaDevices.getUserMedia(object.constraints)
                .then(function (stream) {
                    object.mediaRecorder = new MediaRecorder(stream);
                    object.mediaRecorder.start();
                    var audioChunks = [];

                    object.mediaRecorder.addEventListener("dataavailable", function (event) {
                        audioChunks.push(event.data);
                    });

                    object.mediaRecorder.addEventListener("stop", function () {
                        var audioBlob = new Blob(audioChunks);
                        var audioUrl = URL.createObjectURL(audioBlob)
                        object.audio = new Audio(audioUrl);
                    });

                    object.timeoutRecordId = setTimeout(function () {
                        object.mediaRecorder.stop();
                    }, 15000);
                })
                .catch(function (error) {
                    if (object.callbackError !== undefined && object.callbackError !== null) {
                        object.callbackError();
                    }
                });
        }
    },
    stopRecording: function () {
        clearInterval(this.timeoutRecordId);
        this.mediaRecorder.stop();
        if (this.stream != null) {
            var audioTracks = this.stream.getAudioTracks();
            if (audioTracks != null && audioTracks.length > 0) {
                if (audioTracks[0] != null) {
                    audioTracks[0].stop();
                }
            }
        }
    },
    listenRecording: function (callbackFinishedAudio) {
        var audio = this.audio;
        this.audioContext.resume().then(function() {
            audio.play();
            audio.addEventListener("ended", function () {
                if (callbackFinishedAudio !== undefined &&
                    callbackFinishedAudio !== null) {
                    callbackFinishedAudio();
                }
            });
        });
    },
    stopListeningRecording: function () {
        this.audio.pause();
    },
    run: function () {
        if (typeof this.audioContext === 'undefined') {
            this.error = true;
            console.log('WebAudio is not supported, test cannot run.');
        } else {
            var object = this;
            navigator.mediaDevices.getUserMedia(object.constraints)
                .then(function (stream) {
                    //object.gotStream(stream);
                    if (object.callbackExito !== undefined && object.callbackExito !== null) {
                        object.callbackExito();
                    }
                })
                .catch(function (error) {
                    if (object.callbackError !== undefined && object.callbackError !== null) {
                        object.callbackError(error);
                    }
                });
        }
    },
    gotStream: function (stream) {
        if (!this.checkAudioTracks(stream)) {
            return;
        }
        this.createAudioBuffer(stream);
    },
    checkAudioTracks: function (stream) {
        this.stream = stream;
        var audioTracks = stream.getAudioTracks();
        if (audioTracks.length < 1) {
            this.error = true;
            console.log('No audio track in returned stream.');
            return false;
        }
        console.log('Audio track created using device=' + audioTracks[0].label);
        return true;
    },
    createAudioBuffer: function () {
        this.audioSource = this.audioContext.createMediaStreamSource(this.stream);
        this.scriptNode = this.audioContext.createScriptProcessor(this.bufferSize,
            this.inputChannelCount, this.outputChannelCount);
        this.audioSource.connect(this.scriptNode);
        this.scriptNode.connect(this.audioContext.destination);
        this.scriptNode.onaudioprocess = this.collectAudio.bind(this);
        this.stopCollectingAudio = setTimeoutWithProgressBar(
            this.onStopCollectingAudio.bind(this), 5000);
    },
    collectAudio: function (event) {
        // Simple silence detection: check first and last sample of each channel in
        // the buffer. If both are below a threshold, the buffer is considered
        // silent.
        var sampleCount = event.inputBuffer.length;
        var allSilent = true;
        for (var c = 0; c < event.inputBuffer.numberOfChannels; c++) {
            var data = event.inputBuffer.getChannelData(c);
            var first = Math.abs(data[0]);
            var last = Math.abs(data[sampleCount - 1]);
            var newBuffer;
            if (first > this.silentThreshold || last > this.silentThreshold) {
                // Non-silent buffers are copied for analysis. Note that the silent
                // detection will likely cause the stored stream to contain discontinu-
                // ities, but that is ok for our needs here (just looking at levels).
                newBuffer = new Float32Array(sampleCount);
                newBuffer.set(data);
                allSilent = false;
            } else {
                // Silent buffers are not copied, but we store empty buffers so that the
                // analysis doesn't have to care.
                newBuffer = new Float32Array();
            }
            this.collectedAudio[c].push(newBuffer);
        }
        if (!allSilent) {
            this.collectedSampleCount += sampleCount;
            if ((this.collectedSampleCount / event.inputBuffer.sampleRate) >=
                this.collectSeconds) {
                this.stopCollectingAudio();
            }
        }
    },
    onStopCollectingAudio: function () {
        this.stream.getAudioTracks()[0].stop();
        this.audioSource.disconnect(this.scriptNode);
        this.scriptNode.disconnect(this.audioContext.destination);
        this.analyzeAudio(this.collectedAudio);
        if (this.error) {
            console.log("Error");
            this.callbackError();
        } else {
            console.log("Éxito");
            this.callbackExito();
        }
    },
    analyzeAudio: function (channels) {
        var activeChannels = [];
        for (var c = 0; c < channels.length; c++) {
            if (this.channelStats(c, channels[c])) {
                activeChannels.push(c);
            }
        }
        if (activeChannels.length === 0) {
            this.error = true;
            console.log('No active input channels detected. Microphone ' +
                'is most likely muted or broken, please check if muted in the ' +
                'sound settings or physically on the device. Then rerun the test.');
        } else {
            console.log('Active audio input channels: ' + activeChannels.length);
        }
        if (activeChannels.length === 2) {
            this.detectMono(channels[activeChannels[0]], channels[activeChannels[1]]);
        }
    },
    channelStats: function (channelNumber, buffers) {
        var maxPeak = 0.0;
        var maxRms = 0.0;
        var clipCount = 0;
        var maxClipCount = 0;
        for (var j = 0; j < buffers.length; j++) {
            var samples = buffers[j];
            if (samples.length > 0) {
                var s = 0;
                var rms = 0.0;
                for (var i = 0; i < samples.length; i++) {
                    s = Math.abs(samples[i]);
                    maxPeak = Math.max(maxPeak, s);
                    rms += s * s;
                    if (maxPeak >= this.clipThreshold) {
                        clipCount++;
                        maxClipCount = Math.max(maxClipCount, clipCount);
                    } else {
                        clipCount = 0;
                    }
                }
                // RMS is calculated over each buffer, meaning the integration time will
                // be different depending on sample rate and buffer size. In practise
                // this should be a small problem.
                rms = Math.sqrt(rms / samples.length);
                maxRms = Math.max(maxRms, rms);
            }
        }

        if (maxPeak > this.silentThreshold) {
            var dBPeak = this.dBFS(maxPeak);
            var dBRms = this.dBFS(maxRms);
            console.log('Channel ' + channelNumber + ' levels: ' +
                dBPeak.toFixed(1) + ' dB (peak), ' + dBRms.toFixed(1) + ' dB (RMS)');
            if (dBRms < this.lowVolumeThreshold) {
                this.error = true;
                console.log('Microphone input level is low, increase input ' +
                    'volume or move closer to the microphone.');
            }
            if (maxClipCount > this.clipCountThreshold) {
                console.log('Clipping detected! Microphone input level ' +
                    'is high. Decrease input volume or move away from the microphone.');
            }
            return true;
        }
        return false;
    },
    detectMono: function (buffersL, buffersR) {
        var diffSamples = 0;
        for (var j = 0; j < buffersL.length; j++) {
            var l = buffersL[j];
            var r = buffersR[j];
            if (l.length === r.length) {
                var d = 0.0;
                for (var i = 0; i < l.length; i++) {
                    d = Math.abs(l[i] - r[i]);
                    if (d > this.monoDetectThreshold) {
                        diffSamples++;
                    }
                }
            } else {
                diffSamples++;
            }
        }
        if (diffSamples > 0) {
            console.log('Stereo microphone detected.');
        } else {
            console.log('Mono microphone detected.');
        }
    },
    dBFS: function (gain) {
        var dB = 20 * Math.log(gain) / Math.log(10);
        // Use Math.round to display up to one decimal place.
        return Math.round(dB * 10) / 10;
    },
};
