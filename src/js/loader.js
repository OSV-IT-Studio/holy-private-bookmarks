let isHiding = false;

function hideThemeLoader() {
    if (isHiding) return;
    isHiding = true;
    
    const loader = document.getElementById('theme-loader-block');
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.display = 'none';
            if (loader.parentNode) {
                loader.parentNode.removeChild(loader);
            }
            isHiding = false;
        }, 200);
    } else {
        isHiding = false;
    }
}