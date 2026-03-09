// ==UserScript==
// @name         华科课程平台自动刷课助手 (全自动无阻拦版)
// @namespace    http://tampermonkey.net/
// @version      0.0.4
// @description  华科课程平台自动刷课助手，精准定位、防测验弹窗拦截、后台无缝连播
// @author       DavLiu (Optimized)
// @include      *://smartcourse.hust.edu.cn/*
// @include      *://smartcourse.hust.edu.cn/mooc-smartcourse/*
// @include      *://smartcourse.hust.edu.cn/mooc-smartcourse/mycourse/studentstudy*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=hust.edu.cn
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // === 状态管理 ===
    let isAutoPlaying = false;
    let mainTimer = null;
    let noVideoTimeout = 0;

    function isStudyPage() {
        return window.location.href.includes('studentstudy') &&
            !window.location.href.includes('login');
    }

    // === UI 界面控制 ===
    function addControlButton() {
        if (document.querySelector('.video-helper-btn')) return;

        const button = document.createElement('button');
        button.className = 'video-helper-btn';
        button.innerHTML = '▶ 开启全自动刷课';
        button.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 99999;
            padding: 10px 20px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            transition: all 0.3s;
        `;
        
        button.onclick = () => {
            isAutoPlaying = !isAutoPlaying;
            if (isAutoPlaying) {
                button.innerHTML = '⏸ 自动刷课中... (点击停止)';
                button.style.background = '#f44336';
                startAutoLoop();
            } else {
                button.innerHTML = '▶ 开启全自动刷课';
                button.style.background = '#4CAF50';
                stopAutoLoop();
            }
        };
        document.body.appendChild(button);
    }

    // === 核心控制逻辑 ===
    function startAutoLoop() {
        console.log('【刷课助手】已开启自动模式，开始检测...');
        noVideoTimeout = 0;
        mainTimer = setInterval(autoWorker, 3000);
        autoWorker();
    }

    function stopAutoLoop() {
        console.log('【刷课助手】已暂停主检测循环。');
        if (mainTimer) {
            clearInterval(mainTimer);
            mainTimer = null;
        }
    }

    // === 🚨 后台弹窗巡逻员 (拦截未完成测验提示框) ===
    // 这个巡逻员会一直在后台运行，只要处于自动刷课状态，有弹窗就会瞬间秒掉
    setInterval(() => {
        if (!isAutoPlaying) return;

        const docs = [document];
        const mainIframe = document.getElementById('iframe');
        if (mainIframe && mainIframe.contentDocument) {
            docs.push(mainIframe.contentDocument);
        }

        for (let doc of docs) {
            // 寻找包含 .con03 的弹窗里的 .nextChapter 按钮
            const popupNextBtn = doc.querySelector('.con03 .nextChapter');
            if (popupNextBtn && popupNextBtn.offsetParent !== null) {
                console.log('【刷课助手】⚠️ 检测到未完成任务(如测验)的拦截弹窗，自动点击“下一节”强行跳过...');
                popupNextBtn.click();
            }
        }
    }, 800); // 0.8秒检查一次，反应极其迅速

    // === 监听来自 iframe 内部的完成消息 ===
    window.addEventListener('message', function(event) {
        if (event.data === 'VIDEO_FINISHED_SIGNAL' && isAutoPlaying) {
            console.log('【刷课助手】收到视频完成信号！等待3秒让服务器记录进度...');
            stopAutoLoop(); 
            
            setTimeout(() => {
                goToNextSection();
            }, 3000);
        }
    });

    // === 自动寻找并破解视频 ===
    function autoWorker() {
        const mainFrame = document.getElementById('iframe');
        if (!mainFrame) return;

        const videoFrame = mainFrame.contentWindow?.document.querySelector('iframe');
        if (!videoFrame) {
            noVideoTimeout++;
            if (noVideoTimeout >= 5) { // 约15秒没视频，判定为非视频页
                console.log('【刷课助手】当前页面无视频(可能是纯测验或文档)，自动跳过...');
                noVideoTimeout = 0;
                stopAutoLoop();
                goToNextSection();
            }
            return;
        }

        noVideoTimeout = 0;

        try {
            if (!videoFrame.contentWindow._hackedScriptInjected) {
                console.log('【刷课助手】正在向视频播放器注入破解代码...');
                videoFrame.contentWindow._hackedScriptInjected = true;
                
                videoFrame.contentWindow.eval(`
                    function modifyPlayer() {
                        if(typeof videojs === 'undefined' || !videojs.getAllPlayers().length) {
                            setTimeout(modifyPlayer, 1000);
                            return;
                        }

                        const players = videojs.getAllPlayers();
                        let hasProcessed = false;

                        players.forEach(player => {
                            try {
                                player.play();
                                player.currentTime(player.duration() > 0 ? player.duration() : 9999);
                                player.trigger('ended');

                                player.reportProgress = function() {
                                    return {
                                        completed: true,
                                        duration: this.duration(),
                                        position: this.duration()
                                    };
                                };
                                hasProcessed = true;
                            } catch(e) { }
                        });

                        if (hasProcessed) {
                            if(typeof ed_complete === 'function') {
                                setTimeout(ed_complete, 1000);
                            }
                            console.log('【iframe内部】视频处理完成，正在通知主页面...');
                            window.top.postMessage('VIDEO_FINISHED_SIGNAL', '*');
                        } else {
                            setTimeout(modifyPlayer, 1000);
                        }
                    }
                    modifyPlayer();
                `);
            }
        } catch (e) {
            // 跨域等待
        }
    }

    // === 精准寻找并跳转下一节 ===
    function goToNextSection() {
        console.log('【刷课助手】准备进入下一节...');
        let clicked = false;

        const docs = [document];
        const mainIframe = document.getElementById('iframe');
        if (mainIframe && mainIframe.contentDocument) {
            docs.push(mainIframe.contentDocument);
        }

        for (let doc of docs) {
            if (clicked) break;

            // 策略1：精确类名/ID寻找
            let nextBtn = doc.querySelector('.orientationright, #right1');
            
            // 策略2：精确文字寻找
            if (!nextBtn) {
                const elements = doc.querySelectorAll('div, a, button, span');
                for (let el of elements) {
                    if (el.innerText && el.innerText.trim() === '下一节') {
                        if (el.children.length === 0) { 
                            nextBtn = el;
                            break;
                        }
                    }
                }
            }

            // 执行主按钮点击
            if (nextBtn) {
                console.log('【刷课助手】🎯 锁定右侧主“下一节”按钮！正在点击：', nextBtn);
                nextBtn.click();
                clicked = true;
            }
        }

        // 策略3：左侧目录备用点击
        if (!clicked) {
            for (let doc of docs) {
                const activeNode = doc.querySelector('.active, .current, .poscatalog_active');
                if (activeNode) {
                    let nextNode = activeNode.nextElementSibling;
                    if (!nextNode && activeNode.parentElement.tagName === 'LI') {
                        nextNode = activeNode.parentElement.nextElementSibling;
                    }
                    if (nextNode) {
                        const clickTarget = nextNode.querySelector('a') || nextNode;
                        console.log('【刷课助手】通过课程目录找到下一个任务，正在点击...');
                        clickTarget.click();
                        clicked = true;
                        break;
                    }
                }
            }
        }

        if (clicked) {
            // 点击后给页面 5 秒时间刷新。如果中间弹出了确认框，上面写的后台巡逻员会自动将其点掉
            setTimeout(() => {
                if(isAutoPlaying) {
                    console.log('【刷课助手】进入新页面，重启检测...');
                    startAutoLoop();
                }
            }, 5000);
        } else {
            console.warn('【刷课助手】未能找到任何“下一节”标志，课程可能已全部学完！');
            const btn = document.querySelector('.video-helper-btn');
            if (btn) {
                btn.innerHTML = '🎉 课程可能已全部完成';
                btn.style.background = '#9e9e9e';
                isAutoPlaying = false;
            }
        }
    }

    // === 初始化 ===
    function init() {
        if (!isStudyPage()) return;
        if (document.querySelector('.video-helper-btn')) return;

        console.log('【刷课助手】初始化...');
        addControlButton();
    }

    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            init();
        }
    }).observe(document, { subtree: true, childList: true });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
