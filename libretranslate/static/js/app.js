// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
// API host/endpoint
var BaseUrl = window.location.protocol + "//" + window.location.host;
var htmlRegex = /<(.*)>.*?|<(.*)\/>/;
document.addEventListener('DOMContentLoaded', function(){
    var sidenavElems = document.querySelectorAll('.sidenav');
    var sidenavInstances = M.Sidenav.init(sidenavElems);

    var app = new Vue({
        el: '#app',
        delimiters: ['[[',']]'],
        data: {
            BaseUrl: BaseUrl,
            loading: true,
            error: "",
            langs: [],
            settings: {},
            sourceLang: "",
            targetLang: "",

            loadingTranslation: false,
            inputText: "",
            inputTextareaHeight: 250,
            savedTanslatedText: "",
            translatedText: "",
            output: "",
            charactersLimit: -1,
            
            detectedLangText: "",

            copyTextLabel: "Copy text",

            suggestions: false,
            isSuggesting: false,

            supportedFilesFormat : [],
            translationType: "text",
            inputFile: false,
            loadingFileTranslation: false,
            translatedFileUrl: false,
            filesTranslation: true,
            frontendTimeout: 500
        },
        mounted: function() {
            const self = this;

            const settingsRequest = new XMLHttpRequest();
            settingsRequest.open("GET", BaseUrl + "/frontend/settings", true);

            const langsRequest = new XMLHttpRequest();
            langsRequest.open("GET", BaseUrl + "/languages", true);

            settingsRequest.onload = function() {
                if (this.status >= 200 && this.status < 400) {
                    self.settings = JSON.parse(this.response);
                    self.sourceLang = self.settings.language.source.code;
                    self.targetLang = self.settings.language.target.code;
                    self.charactersLimit = self.settings.charLimit;
                    self.suggestions = self.settings.suggestions;
                    self.supportedFilesFormat = self.settings.supportedFilesFormat;
                    self.filesTranslation = self.settings.filesTranslation;
                    self.frontendTimeout = self.settings.frontendTimeout;

                    if (langsRequest.response) {
                        handleLangsResponse(self, langsRequest);
                    } else {
                        langsRequest.onload = function() {
                            handleLangsResponse(self, this);
                        }
                    }
                } else {
                    self.error = "Cannot load /frontend/settings";
                    self.loading = false;
                }
            };

            settingsRequest.onerror = function() {
                self.error = "Error while calling /frontend/settings";
                self.loading = false;
            };

            langsRequest.onerror = function() {
                self.error = "Error while calling /languages";
                self.loading = false;
            };

            settingsRequest.send();
            langsRequest.send();
        },
        updated: function(){
            if (this.isSuggesting) return;

            M.FormSelect.init(this.$refs.sourceLangDropdown);
            M.FormSelect.init(this.$refs.targetLangDropdown);

            if (this.$refs.inputTextarea){
                this.$refs.inputTextarea.focus()

                if (this.inputText === ""){
                    this.$refs.inputTextarea.style.height = this.inputTextareaHeight + "px";
                    this.$refs.translatedTextarea.style.height = this.inputTextareaHeight + "px";
                } else{
                    this.$refs.inputTextarea.style.height = this.$refs.translatedTextarea.style.height = "1px";
                    this.$refs.inputTextarea.style.height = Math.max(this.inputTextareaHeight, this.$refs.inputTextarea.scrollHeight + 32) + "px";
                    this.$refs.translatedTextarea.style.height = Math.max(this.inputTextareaHeight, this.$refs.translatedTextarea.scrollHeight + 32) + "px";
                }
            }

            if (this.charactersLimit !== -1 && this.inputText.length >= this.charactersLimit){
                this.inputText = this.inputText.substring(0, this.charactersLimit);
            }

            // Update "selected" attribute (to overcome a vue.js limitation)
            // but properly display checkmarks on supported browsers.
            // Also change the <select> width value depending on the <option> length
            if (this.$refs.sourceLangDropdown) {
                updateSelectedAttribute(this.$refs.sourceLangDropdown, this.sourceLang);
            }

            if (this.$refs.targetLangDropdown) {
                updateSelectedAttribute(this.$refs.targetLangDropdown, this.targetLang);
            }
        },
        computed: {
            requestCode: function(){
                return ['const res = await fetch("' + this.BaseUrl + '/translate", {',
                    '	method: "POST",',
                    '	body: JSON.stringify({',
                    '		q: ' + this.$options.filters.escape(this.inputText) + ',',
                    '		source: ' + this.$options.filters.escape(this.sourceLang) + ',',
                    '		target: ' + this.$options.filters.escape(this.targetLang) + ',',
                    '		format: "' + (this.isHtml ? "html" : "text") + '",',
                    '		api_key: "' + (localStorage.getItem("api_key") || "") + '"',
                    '	}),',
                    '	headers: { "Content-Type": "application/json" }',
                    '});',
                    '',
                    'console.log(await res.json());'].join("\n");
            },
            supportedFilesFormatFormatted: function() {
                return this.supportedFilesFormat.join(', ');
            },
            isHtml: function(){
                return htmlRegex.test(this.inputText);
            },
            canSendSuggestion: function(){
                return this.translatedText.trim() !== "" && this.translatedText !== this.savedTanslatedText;
            },
            targetLangs: function(){
                if (!this.sourceLang) return this.langs;
                else{
                    var lang = this.langs.find(l => l.code === this.sourceLang);
                    if (!lang) return this.langs;
                    return lang.targets.map(t => this.langs.find(l => l.code === t));
                }
            }
        },
        filters: {
            escape: function(v){
                return JSON.stringify(v);
            },
            highlight: function(v){
                return Prism.highlight(v, Prism.languages.javascript, 'javascript');
            }
        },
        methods: {
            abortPreviousTransRequest: function(){
                if (this.transRequest){
                    this.transRequest.abort();
                    this.transRequest = null;
                }
            },
            swapLangs: function(e){
                this.closeSuggestTranslation(e);

                // Make sure that we can swap
                // by checking that the current target language
                // has source language as target
                var tgtLang = this.langs.find(l => l.code === this.targetLang);
                if (tgtLang.targets.indexOf(this.sourceLang) === -1) return; // Not supported

                var t = this.sourceLang;
                this.sourceLang = this.targetLang;
                this.targetLang = t;
                this.inputText = this.translatedText;
                this.translatedText = "";
                this.handleInput(e);
            },
            dismissError: function(){
                this.error = '';
            },
            getQueryParam: function (key) {
                const params = new URLSearchParams(window.location.search);
                return params.get(key)
            },
            updateQueryParam: function (key, value) {
                let searchParams = new URLSearchParams(window.location.search)
                searchParams.set(key, value);
                let newRelativePathQuery = window.location.pathname + '?' + searchParams.toString();
                history.pushState(null, '', newRelativePathQuery);
            },
            handleInput: function(e){
                this.closeSuggestTranslation(e)

                this.updateQueryParam('source', this.sourceLang)
                this.updateQueryParam('target', this.targetLang)
                this.updateQueryParam('q', encodeURI(this.inputText))

                if (this.timeout) clearTimeout(this.timeout);
                this.timeout = null;

                this.detectedLangText = "";
                
                if (this.inputText === ""){
                    this.translatedText = "";
                    this.output = "";
                    this.abortPreviousTransRequest();
                    this.loadingTranslation = false;
                    return;
                }

                var self = this;

                self.loadingTranslation = true;
                this.timeout = setTimeout(function(){
                    self.abortPreviousTransRequest();

                    var request = new XMLHttpRequest();
                    self.transRequest = request;

                    var data = new FormData();
                    data.append("q", self.inputText);
                    data.append("source", self.sourceLang);
                    data.append("target", self.targetLang);
                    data.append("format", self.isHtml ? "html" : "text");
                    data.append("api_key", localStorage.getItem("api_key") || "");

                    request.open('POST', BaseUrl + '/translate', true);

                    request.onload = function() {
                        try{
                            var res = JSON.parse(this.response);
                            // Success!
                            if (res.translatedText !== undefined){
                                self.translatedText = res.translatedText;
                                self.loadingTranslation = false;
                                self.output = JSON.stringify(res, null, 4);
                                if(self.sourceLang == "auto" && res.detectedLanguage !== undefined){
                                    let lang = self.langs.find(l => l.code === res.detectedLanguage.language)
                                    self.detectedLangText = ": " + (lang !== undefined ? lang.name : res.detectedLanguage.language) + " (" + res.detectedLanguage.confidence + "%)";
                                }
                            } else{
                                throw new Error(res.error || "Unknown error");
                            }
                        } catch (e) {
                            self.error = e.message;
                            self.loadingTranslation = false;
                        }
                    };

                    request.onerror = function() {
                        self.error = "Error while calling /translate";
                        self.loadingTranslation = false;
                    };

                    request.send(data);
                }, self.frontendTimeout);
            },
            copyText: function(e){
                e.preventDefault();
                this.$refs.translatedTextarea.select();
                this.$refs.translatedTextarea.setSelectionRange(0, 9999999); /* For mobile devices */
                document.execCommand("copy");

                if (this.copyTextLabel === "Copy text"){
                    this.copyTextLabel = "Copied";
                    var self = this;
                    setTimeout(function(){
                        self.copyTextLabel = "Copy text";
                    }, 1500);
                }
            },
            suggestTranslation: function(e) {
                e.preventDefault();
                this.savedTanslatedText = this.translatedText

                this.isSuggesting = true;
                this.$nextTick(() => {
                    this.$refs.translatedTextarea.focus();
                });
            },
            closeSuggestTranslation: function(e) {
                if(this.isSuggesting) {
                    e.preventDefault();
                    // this.translatedText = this.savedTanslatedText
                }

                this.isSuggesting = false;
            },
            sendSuggestion: function(e) {
                e.preventDefault();

                var self = this;

                var request = new XMLHttpRequest();
                self.transRequest = request;

                var data = new FormData();
                data.append("q", self.inputText);
                data.append("s", self.translatedText);
                data.append("source", self.sourceLang);
                data.append("target", self.targetLang);
                data.append("api_key", localStorage.getItem("api_key") || "");

                request.open('POST', BaseUrl + '/suggest', true);
                request.onload = function() {
                    try{
                        var res = JSON.parse(this.response);
                        if (res.success){
                            M.toast({html: 'Thanks for your correction. Note the suggestion will not take effect right away.'})
                            self.closeSuggestTranslation(e)
                        }else{
                            throw new Error(res.error || "Unknown error");
                        }
                    }catch(e){
                        self.error = e.message;
                        self.closeSuggestTranslation(e)
                    }
                };

                request.onerror = function() {
                    self.error = "Error while calling /suggest";
                    self.loadingTranslation = false;
                };

                request.send(data);
            },
            deleteText: function(e){
                e.preventDefault();
                this.inputText = this.translatedText = this.output = "";
                this.$refs.inputTextarea.focus();
            },
            switchType: function(type) {
                this.translationType = type;
            },
            handleInputFile: function(e) {
                this.inputFile = e.target.files[0];
            },
            removeFile: function(e) {
              e.preventDefault()
              this.inputFile = false;
              this.translatedFileUrl = false;
              this.loadingFileTranslation = false;
            },
            translateFile: function(e) {
                e.preventDefault();

                let self = this;
                let translateFileRequest = new XMLHttpRequest();

                translateFileRequest.open("POST", BaseUrl + "/translate_file", true);

                let data = new FormData();
                data.append("file", this.inputFile);
                data.append("source", this.sourceLang);
                data.append("target", this.targetLang);
                data.append("api_key", localStorage.getItem("api_key") || "");

                this.loadingFileTranslation = true

                translateFileRequest.onload = function()  {
                    if (translateFileRequest.readyState === 4 && translateFileRequest.status === 200) {
                        try{
                            self.loadingFileTranslation = false;

                            let res = JSON.parse(this.response);
                            if (res.translatedFileUrl){
                                self.translatedFileUrl = res.translatedFileUrl;

                                let link = document.createElement("a");
                                link.target = "_blank";
                                link.href = self.translatedFileUrl;
                                link.click();
                            }else{
                                throw new Error(res.error || "Unknown error");
                            }

                        }catch(e){
                            self.error = e.message;
                            self.loadingFileTranslation = false;
                            self.inputFile = false;
                        }
                    }else{
                        let res = JSON.parse(this.response);
                        self.error = res.error || "Unknown error";
                        self.loadingFileTranslation = false;
                        self.inputFile = false;
                    }
                }

                translateFileRequest.onerror = function() {
                    self.error = "Error while calling /translate_file";
                    self.loadingFileTranslation = false;
                    self.inputFile = false;
                };

                translateFileRequest.send(data);
            }
        }
    });
});

/**
 * @param {object} self
 * @param {XMLHttpRequest} response
 */
function handleLangsResponse(self, response) {
    if (response.status >= 200 && response.status < 400) {
        self.langs = JSON.parse(response.response);

        if (self.langs.length === 0){
            self.loading = false;
            self.error = "No languages available. Did you install the models correctly?"
            return;
        }

        self.langs.push({ name: "Auto Detect", code: "auto", targets: self.langs.map(l => l.code)})

        const sourceLanguage = self.langs.find(l => l.code === self.getQueryParam("source"))
        const targetLanguage = self.langs.find(l => l.code === self.getQueryParam("target"))

        if (sourceLanguage) {
            self.sourceLang = sourceLanguage.code
        }

        if (targetLanguage) {
            self.targetLang = targetLanguage.code
        }

        const defaultText = self.getQueryParam("q")

        if (defaultText) {
            self.inputText = decodeURI(defaultText)
            self.handleInput(new Event('none'))
        }
    } else {
        self.error = "Cannot load /languages";
    }

    self.loading = false;
}

/**
 * @param {object} langDropdown
 * @param {string} lang
 */
function updateSelectedAttribute(langDropdown, lang) {
    for (const child of langDropdown.children) {
        if (child.value === lang){
            child.setAttribute('selected', '');
            langDropdown.style.width = getTextWidth(child.text) + 24 + 'px';
        } else{
            child.removeAttribute('selected');
        }
    }
}

function getTextWidth(text) {
    var canvas = getTextWidth.canvas || (getTextWidth.canvas = document.createElement("canvas"));
    var ctx = canvas.getContext("2d");
    ctx.font = 'bold 16px sans-serif';
    var textWidth = Math.ceil(ctx.measureText(text).width);
    return textWidth;
}

function setApiKey(){
    var prevKey = localStorage.getItem("api_key") || "";
    var newKey = "";
    var instructions = "contact the server operator.";
    if (window.getApiKeyLink) instructions = "press the \"Get API Key\" link."
    newKey = window.prompt("Type in your API Key. If you need an API key, " + instructions, prevKey);
    if (newKey === null) newKey = "";

    localStorage.setItem("api_key", newKey);
}

// @license-end
