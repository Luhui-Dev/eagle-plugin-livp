(function() {
    'use strict';
    
    // 获取 URL 参数
    const urlParams = new URLSearchParams(window.location.search);
    const filePath = urlParams.get('path');
    const itemId = urlParams.get('id');
    const width = urlParams.get('width');
    const height = urlParams.get('height');
    const theme = urlParams.get('theme') || 'dark';
    const lang = urlParams.get('lang') || 'zh-CN';
    
    // DOM 元素
    const mainImage = document.getElementById('mainImage');
    const mainVideo = document.getElementById('mainVideo');
    const imageContainer = document.getElementById('imageContainer');
    const videoContainer = document.getElementById('videoContainer');
    const videoError = document.getElementById('videoError');
    const toggleBtn = document.getElementById('toggleVideo');
    const toggleText = document.getElementById('toggleText');
    const loading = document.getElementById('loading');
    const errorDiv = document.getElementById('error');
    
    // Blob URL 管理
    const blobUrls = [];
    
    // 设置主题
    document.body.setAttribute('data-theme', theme);
    
    /**
     * 检测是否为 ZIP 文件
     */
    function isZipFile(buffer) {
        if (buffer.length < 4) return false;
        // ZIP magic bytes: PK\x03\x04
        return buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;
    }
    
    /**
     * 从 ZIP 中选择最大的 JPG 文件
     */
    function findLargestJpg(zip) {
        const jpgFiles = [];
        
        zip.forEach((relativePath, file) => {
            if (!file.dir) {
                const lowerPath = relativePath.toLowerCase();
                if (lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg')) {
                    jpgFiles.push({
                        path: relativePath,
                        file: file,
                        size: file._data ? file._data.uncompressedSize : 0
                    });
                }
            }
        });
        
        if (jpgFiles.length === 0) {
            return null;
        }
        
        // 按大小排序，返回最大的
        jpgFiles.sort((a, b) => b.size - a.size);
        return jpgFiles[0];
    }
    
    /**
     * 从 ZIP 中选择最大的 MOV 文件
     */
    function findLargestMov(zip) {
        const movFiles = [];
        
        zip.forEach((relativePath, file) => {
            if (!file.dir) {
                const lowerPath = relativePath.toLowerCase();
                if (lowerPath.endsWith('.mov')) {
                    movFiles.push({
                        path: relativePath,
                        file: file,
                        size: file._data ? file._data.uncompressedSize : 0
                    });
                }
            }
        });
        
        if (movFiles.length === 0) {
            return null;
        }
        
        // 按大小排序，返回最大的
        movFiles.sort((a, b) => b.size - a.size);
        return movFiles[0];
    }
    
    /**
     * 创建 Blob URL
     */
    function createBlobURL(data, mimeType) {
        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        blobUrls.push(url);
        return url;
    }
    
    /**
     * 清理所有 Blob URL
     */
    function cleanupBlobURLs() {
        blobUrls.forEach(url => {
            try {
                URL.revokeObjectURL(url);
            } catch (e) {
                // 忽略清理错误
            }
        });
        blobUrls.length = 0;
    }
    
    /**
     * 显示错误信息
     */
    function showError(message) {
        loading.style.display = 'none';
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
    
    /**
     * 处理视频错误
     */
    function handleVideoError() {
        videoError.style.display = 'block';
        mainVideo.style.display = 'none';
        toggleBtn.style.display = 'none';
    }
    
    /**
     * 切换视频显示
     */
    function toggleVideo() {
        if (videoContainer.style.display === 'none') {
            videoContainer.style.display = 'block';
            toggleText.textContent = '隐藏视频';
            // 尝试播放视频
            mainVideo.play().catch(err => {
                console.warn('Video play failed:', err);
            });
        } else {
            videoContainer.style.display = 'none';
            toggleText.textContent = '显示视频';
            mainVideo.pause();
        }
    }
    
    /**
     * 主加载函数
     */
    async function loadLIVP() {
        if (!filePath) {
            showError('未指定文件路径');
            return;
        }
        
        try {
            // 1. 读取文件
            let arrayBuffer;
            try {
                // 尝试使用 fetch（适用于 file:// 协议）
                const response = await fetch(filePath);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                arrayBuffer = await response.arrayBuffer();
            } catch (fetchError) {
                // 如果 fetch 失败，尝试使用 Node.js fs（如果环境支持）
                if (typeof require !== 'undefined') {
                    try {
                        const fs = require('fs');
                        const buffer = fs.readFileSync(filePath);
                        arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
                    } catch (fsError) {
                        throw new Error(`无法读取文件: ${fetchError.message}`);
                    }
                } else {
                    throw new Error(`无法读取文件: ${fetchError.message}`);
                }
            }
            
            // 2. 检测 ZIP magic bytes
            const uint8Array = new Uint8Array(arrayBuffer);
            if (!isZipFile(uint8Array)) {
                showError('文件不是有效的 ZIP 格式');
                return;
            }
            
            // 3. 加载 ZIP
            const zip = await JSZip.loadAsync(arrayBuffer);
            
            // 4. 查找 JPG 和 MOV
            const largestJpg = findLargestJpg(zip);
            const largestMov = findLargestMov(zip);
            
            // 5. 加载 JPG
            if (largestJpg) {
                const jpgData = await largestJpg.file.async('uint8array');
                const jpgUrl = createBlobURL(jpgData, 'image/jpeg');
                mainImage.src = jpgUrl;
                mainImage.onload = () => {
                    loading.style.display = 'none';
                };
                mainImage.onerror = () => {
                    showError('图片加载失败');
                };
            } else {
                showError('未找到 JPG 图片文件');
                return;
            }
            
            // 6. 加载 MOV（如果存在）
            if (largestMov) {
                const movData = await largestMov.file.async('uint8array');
                const movUrl = createBlobURL(movData, 'video/quicktime');
                
                // 设置视频源
                mainVideo.src = movUrl;
                
                // 监听视频错误
                mainVideo.addEventListener('error', handleVideoError, { once: true });
                
                // 监听视频加载
                mainVideo.addEventListener('loadedmetadata', () => {
                    toggleBtn.style.display = 'block';
                }, { once: true });
                
                // 尝试加载视频（静默失败）
                mainVideo.load();
            } else {
                // 没有 MOV 文件，隐藏视频相关控件
                toggleBtn.style.display = 'none';
            }
            
        } catch (error) {
            console.error('Error loading LIVP:', error);
            showError(`加载失败: ${error.message}`);
        }
    }
    
    // 绑定事件
    toggleBtn.addEventListener('click', toggleVideo);
    
    // 页面卸载时清理资源
    window.addEventListener('beforeunload', cleanupBlobURLs);
    
    // 页面隐藏时暂停视频
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && mainVideo) {
            mainVideo.pause();
        }
    });
    
    // 开始加载
    loadLIVP();
})();
