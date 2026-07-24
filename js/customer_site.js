// 用户自定义站点（可在此添加个人源）
const CUSTOMER_SITES = {
    // 在此添加自定义API源，稍后通过extendAPISites合并到主配置
    // 格式: { key: { api: 'URL', name: '显示名' } }
};

// 调用全局方法合并
if (window.extendAPISites) {
    window.extendAPISites(CUSTOMER_SITES);
} else {
    console.error("错误：请先加载 config.js！");
}
