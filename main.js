// ---------- DOM 引用 ----------
const form = document.getElementById('loginForm');
const accountInput = document.getElementById('account');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const messageBox = document.getElementById('messageBox');

// ---------- 辅助：显示消息（替代 alert） ----------
function showMessage(text, type = 'error') {
    messageBox.textContent = text;
    messageBox.className = 'message-box ' + type; // 自动显示
    // 5秒后自动隐藏
    clearTimeout(window._msgTimer);
    window._msgTimer = setTimeout(() => {
        messageBox.className = 'message-box';
    }, 5000);
}

// ---------- 表单提交 ----------
form.addEventListener('submit', async function (e) {
    e.preventDefault(); // 阻止页面刷新

    // 1. 取值并校验
    const account = accountInput.value.trim();
    const password = passwordInput.value.trim();

    if (!account || !password) {
        showMessage('⚠️ 账号和密码都不能为空', 'error');
        return;
    }
    if (password.length < 6) {
        showMessage('⚠️ 密码至少需要 6 位', 'error');
        return;
    }

    // 2. 按钮加载状态
    loginBtn.disabled = true;
    loginBtn.classList.add('loading');

    // 3. 构造 JSON
    const requestBody = { account, password };
    const jsonString = JSON.stringify(requestBody);

    try {
        const response = await fetch(
            'https://apit.qmpsu.com/v3/login?platform=pwa&version=1.0.0',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: jsonString
            }
        );

        // 解析响应（无论 HTTP 状态如何）
        const result = await response.json();

        // 4. 根据业务字段判断
        if (result.success === true) {
            // ✅ 成功
            const token = result.token;
            localStorage.setItem('token', token);

            showMessage('✅ 登录成功！欢迎回来 ' + (result.name || '用户'), 'success');

            // 延迟一下跳转，让用户看到成功提示
            // setTimeout(() => {
            //     // window.location.href = 'https://9ygh3.sxhfxcyy.com/#/'; // 取消注释跳转
            //     alert('登录成功，即将跳转（演示）');
            // }, 800);

            // 防止重复领取
            // loginBtn.disabled = true;
            // loginBtn.classList.add('loading');

            // 领取该网站的VIP天数
            const baseUrl = "https://api.atzxyff.com/vw3/202406/mission/";

            const headers = { "Content-Type": "application/json", "Access-Token": `Bearer ${token}` };

            // 改用 async/await，统一处理错误
            async function fetchData(url) {
                try {
                    const response = await fetch(url, { headers });
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    const data = await response.json();
                    return data;
                } catch (error) {
                    console.error(`请求失败: ${url}`, error);
                    return null; // 返回 null 表示失败
                }
            }

            async function claimMissions(missionType, start, end) {
                const tasks = [];
                for (let i = start; i < end; i++) {
                    tasks.push(fetchData(`${baseUrl}${missionType}/${i}`));
                }
                const results = await Promise.all(tasks);
                const successCount = results.filter(r => r && r.success).length;
                return successCount;
            }

            try {
                const dailyCount = await claimMissions('daily', 4, 10);
                const vipCount = await claimMissions('vip', 1, 7);
                showMessage(`🎉 登录成功！已自动领取每日任务 ${dailyCount} 个，VIP任务 ${vipCount} 个`, 'success');
            } catch (err) {
                console.error('领取任务异常:', err);
                showMessage('⚠️ 部分任务领取失败，请稍后手动尝试', 'error');
            }
        } else {
            // ❌ 业务失败（账号密码错误等）
            showMessage('❌ ' + (result.msg || '登录失败，请重试'), 'error');
        }
    } catch (error) {
        // 网络异常或 JSON 解析异常
        console.error('请求异常:', error);
        showMessage('⚠️ 网络异常，请检查连接后重试', 'error');
    } finally {
        // 恢复按钮状态
        loginBtn.disabled = false;
        loginBtn.classList.remove('loading');
    }
});

// ---------- （可选）按回车触发表单（默认已支持） ----------
