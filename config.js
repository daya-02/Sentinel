// Put your Groq API key here
const CONFIG = {
    GROQ_API_KEY: "upload api"
};

// Also export it for modules if needed (though we'll likely load it globally in V3 service worker)
if (typeof module !== "undefined") {
    module.exports = CONFIG;
}
