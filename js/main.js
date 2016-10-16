var websocket = null;
var wsTimeout = null;
var wsTryOpen = false;

var floatData = new Float32Array();
var hasNewData = false;
var refreshInterval = null;
var series = null;

var maxTime = 20;
var dropData = 10;
var deviceTime = -1;

function setWsTimeout() {
    clearWsTimeout();
    if (websocket != null) {	
        if (websocket.readyState == websocket.CONNECTING) {
            wsTimeout = setTimeout("wsOnOpenTimeout()", parseInt($("#openTimeout")[0].value) * 1000);
        } else if (websocket.readyState == websocket.OPEN) {
            wsTimeout = setTimeout("wsOnNodataTimeout()", parseInt($("#nodataTimeout")[0].value) * 1000);
        } else if (websocket.readyState == websocket.CLOSING) {
            wsTimeout = setTimeout("wsOnCloseTimeout()", parseInt($("#closeTimeout")[0].value) * 1000);
        }
    }
}

function clearWsTimeout() {
    if (wsTimeout != null) {
        clearTimeout(wsTimeout);
        wsTimeout = null;
    }
}

function wsOnOpen(evt) {
    clearWsTimeout();
    console.log("已连接");
    $("#status").html("已连接");
    setWsTimeout();
}

function pageRender() {
    stats.begin();
    if (deviceData.length > 0) {
        var data = deviceData.get(-1); 
        for (var i = 0; i < deviceData.frameLength; i++) {
            $("#data" + i).html(data[i].toFixed(4));
        }
        $("#data_count").html(deviceData.length.toString());
        plot2d.render();
        plot2d2.render();
    }
    stats.end();
    requestAnimationFrame(pageRender);
}

var isFinished = true;
function wsOnMessage(evt) {
    if (evt.target != websocket) {
        evt.target.close();
    }
    clearWsTimeout();
    if (typeof evt.data == "object" && evt.data instanceof Blob) {
        // console.log("收到二进制数据");
        if (evt.data.size % (deviceData.frameLength * 4) == 0) {
            if (isFinished) {
                isFinished = false;
                var fileReader = new FileReader();
                fileReader.onload = function() {
                    deviceData.push(this.result);
                    isFinished = true;
                };
                fileReader.readAsArrayBuffer(evt.data);
            } else {
                console.log("lost pkg");
            }
        } else {
            console.log("error binary frame", evt.data.size);
        }
    } else if (typeof evt.data == "string") {
        // console.log("收到文本数据");
        $("#textFrame").html(evt.data);
    }
    setWsTimeout();
}
function wsOnError(evt) {
    console.log("发生错误");
}
function wsOnClose(evt) {
    clearWsTimeout();
    console.log("已断开");
    $("#status").html("已断开");
    websocket.close();
    websocket = null;
    if (wsTryOpen) {
        wsOnOpening();
    } else {
        $("#wsServer").prop('disabled', false);
        $("#openTimeout").prop('disabled', false);
        $("#closeTimeout").prop('disabled', false);
        $("#nodataTimeout").prop('disabled', false);
    }
}

function wsOnOpening() {
    clearWsTimeout();
    console.log("连接中");
    $("#status").html("连接中");
    websocket = new WebSocket("ws://" + $("#wsServer")[0].value); 
    websocket.onopen = wsOnOpen;
    websocket.onmessage = wsOnMessage;
    websocket.onerror = wsOnError;
    websocket.onclose = wsOnClose;
    setWsTimeout();
}
function wsOnClosing() {
    clearWsTimeout();
    console.log("关闭中");
    $("#status").html("关闭中");
    websocket.close();
    setWsTimeout();
}
function wsOnOpenTimeout() {
    clearWsTimeout();
    if (websocket != null && websocket.readyState == websocket.CONNECTING) {
        console.log("连接超时");
        $("#status").html("连接超时");
        wsOnClosing();
    }
}
function wsOnNodataTimeout() {
    clearWsTimeout();
    if (websocket != null && websocket.readyState == websocket.OPEN) {
        console.log("无数据超时");
        $("#status").html("无数据超时");
        wsOnClosing();
    }
}
function wsOnCloseTimeout() {
    clearWsTimeout();
    if (websocket != null && websocket.readyState == websocket.CLOSING) {
        console.log("关闭超时");
        $("#status").html("关闭超时");
        websocket = null;
        if (wsTryOpen) {
            wsOnOpening();
        } else {
            $("#wsServer").prop('disabled', false);
            $("#openTimeout").prop('disabled', false);
            $("#closeTimeout").prop('disabled', false);
            $("#nodataTimeout").prop('disabled', false);
        }
    }
}

function dataRefreshHandler() {
    if (hasNewData) {
        hasNewData = false;
    }
    //refreshInterval = setTimeout(dataRefreshHandler, 1);
}

var remoteControl = {speed: 0, speeddiff: 0};
function setRemote(k, v) {
    if (remoteControl[k] != v && websocket != null && websocket.readyState == websocket.OPEN) {
        remoteControl[k] = v;
        websocket.send(k + "=" + v);
        $("#" + k)[0].value = v;
    }
}

var plot;
var plot2d;
$(document).ready(function(){
    // 初始化数据存储
    deviceData = new DeviceData();

    $.ajaxSetup({cache:false});
    $("#connect").click(function() {
        wsTryOpen = true;
        $("#wsServer").prop('disabled', true);
        $("#openTimeout").prop('disabled', true);
        $("#closeTimeout").prop('disabled', true);
        $("#nodataTimeout").prop('disabled', true);
        $("#connect").prop('disabled', true);
        $("#disconnect").prop('disabled', false);
        wsOnOpening();
        refreshInterval = setTimeout(dataRefreshHandler, 1);
    });
    $("#disconnect").click(function() {
        clearTimeout(refreshInterval);
        wsTryOpen = false;
        $("#connect").prop('disabled', false);
        $("#disconnect").prop('disabled', true);
        wsOnClosing();
    });
    $(document).keydown(function (event) {
        if (event.keyCode == 37) { // 左
            setRemote("speeddiff", 0.4);
        } else if (event.keyCode == 39) { // 右
            setRemote("speeddiff", -0.4);
        } else if (event.keyCode == 38) { // 上
            setRemote("speed", 0.3);
        } else if (event.keyCode == 40) { // 下
            setRemote("speed", -0.3);
        }
    });
    $(document).keyup(function (event) {
        if (event.keyCode == 37 || event.keyCode == 39) { // 右
            setRemote("speeddiff", 0);
        } else if (event.keyCode == 38 || event.keyCode == 40) { // 下
            setRemote("speed", 0);
        }
    });
    if (window.DeviceOrientationEvent) {  
        window.addEventListener("deviceorientation", function orientationHandler(event) {  
            var z = 10;
            if (event.beta < -z) {
                //setRemote("speed", (event.beta - -z) / -20);
                setRemote("speed", 0.3);
            } else if (event.beta > z) {
                //setRemote("speed", (event.beta - z) / -20);
                setRemote("speed", -0.3);
            } else if (event.beta < z && event.beta > -z) {
                setRemote("speed", 0);
            }
            if (event.gamma < -z) {
                //setRemote("speeddiff", (event.gamma - -z) / -10);
                setRemote("speeddiff", 0.4);
            } else if (event.gamma > z) {
                //setRemote("speeddiff", (event.gamma - z) / -10);
                setRemote("speeddiff", -0.4);
            } else if (event.gamma < z && event.gamma > -z) {
                setRemote("speeddiff", 0);
            }
        }, false);  
    }
    
    stats = new Stats();
    stats.showPanel( 0 ); // 0: fps, 1: ms, 2: mb, 3+: custom
    //document.body.appendChild( stats.dom );
    
    

    plot2d = new RealtimePlot1D($("#plot-container"), deviceData, 20);
    //plot2d.addDataIndex(22, 0xFF0000);
    //plot2d.addDataIndex(31, 0x0000FF);
    //plot2d.addDataIndex(32, 0x00FF00);
    //plot2d.addDataIndex(23, 0xFF9900);
    plot2d2 = new RealtimePlot2D($("#plot-container2"), deviceData);
    // plot2d2.addDataIndex([28, 29], 0xFF0000);
    plot2d2.addDataIndex([31, 32], 0x0000FF);
    // plot2d2.addDataIndex([34, 35], 0xFF9900);

    var lineColors = ["FF0000", "FF9900", "00FF00", "FFFF00", "0000FF", "9900FF"];
    var colorIndex = 0;
    for (var i = 0; i < deviceData.frameLength; i++) {
        $("#data" + i).click(function() {
            var index = Number($(this).attr("id").slice(4, 100));
            if ($(this).css("background-color") == "rgba(0, 0, 0, 0)") {
                var color = lineColors[colorIndex++];
                colorIndex %= lineColors.length;
                $(this).css("background-color", "#" + color);
                plot2d.addDataIndex(index, Number("0x" + color));
                console.log("add line", index, color);
            } else {
                console.log("del line", index);
                $(this).css("background-color", "rgba(0, 0, 0, 0)");
                plot2d.delDataIndex(index);
            }
        });
        $("#data" + i).css("text-align", "right");
        $("#data_count").css("text-align", "right");
    }
    $("#data10").click();
    $("#data11").click();
    
    requestAnimationFrame(pageRender);
});
