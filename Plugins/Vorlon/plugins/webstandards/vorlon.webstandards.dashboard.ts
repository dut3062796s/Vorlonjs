module VORLON {
    export class WebStandardsDashboard extends DashboardPlugin {
        constructor() {
            //     name   ,  html for dash   css for dash
            super("webstandards", "control.html", "control.css");
            this._id = "WEBSTANDARDS";
            this.debug = true;
            this._ready = true;
            console.log('Started');
        }

        private _startCheckButton: HTMLButtonElement;
        private _rootDiv: HTMLElement;
        private _currentAnalyse = null;        
        private _refreshloop : any;
        
        public startDashboardSide(div: HTMLDivElement = null): void {
            var script = <HTMLScriptElement>document.createElement("SCRIPT");
            script.src = "/javascripts/css.js";
            document.body.appendChild(script);
            
            this._insertHtmlContentAsync(div, (filledDiv) => {
                this._startCheckButton = <HTMLButtonElement>filledDiv.querySelector('#startCheck');
                this._rootDiv = <HTMLElement>filledDiv;

                // Send message to client when user types and hits return
                this._startCheckButton.addEventListener("click", (evt) => {
                    this._currentAnalyse = { processing: true };
                    this._rootDiv.classList.add("loading");
                    this.sendCommandToClient('startNewAnalyse');
                });

                this._refreshloop = setInterval(() => {
                    this.checkLoadingState();
                }, 3000);
            });
        }
        
        checkLoadingState(){
            if (!this._currentAnalyse || this._currentAnalyse.ended){
                return;                
            }
            
            if (this._currentAnalyse.processing){           
                             
            } else {
                this._rootDiv.classList.remove("loading");
                this._currentAnalyse.ended = true;
            }
        }

        receiveHtmlContent(data : { html: string}){
            if (!this._currentAnalyse){
                this._currentAnalyse =  { processing : true };
            }
            
            console.log('received html from client ', data.html);
            var fragment = document.implementation.createHTMLDocument("analyse");
            fragment.documentElement.innerHTML = data.html;
            this._currentAnalyse.pendingLoad = 0;
            
            this._currentAnalyse.scripts = {};
            var scripts = fragment.querySelectorAll("script");
            for (var i=0; i<scripts.length ; i++){
                var s = scripts[i];
                var src = s.attributes.getNamedItem("src");
                if (src){
                    this._currentAnalyse.scripts[src.value] = { loaded : false, content : null };
                    //console.log("found script " + src.value);
                    this.sendCommandToClient('fetchDocument', { url: src.value });
                    this._currentAnalyse.pendingLoad++;
                }
            }
            
            this._currentAnalyse.stylesheets = {};
            var stylesheets = fragment.querySelectorAll("link[rel=stylesheet]");
            for (var i=0; i<stylesheets.length ; i++){
                var s = stylesheets[i];
                var href = s.attributes.getNamedItem("href");
                if (href){
                    this._currentAnalyse.stylesheets[href.value] = { loaded : false, content : null };
                    //console.log("found stylesheet " + href.value);
                    this.sendCommandToClient('fetchDocument', { url: href.value });
                    this._currentAnalyse.pendingLoad++;
                }
            }
            
            this.analyseDOM(fragment, this._currentAnalyse);
        }
        
        receiveDocumentContent(data: { url:string, content: string, error?:string, status : number }){
            console.log("document loaded " + data.url + " " + data.status);
            var item = null;
            if (this._currentAnalyse.stylesheets[data.url]){
                item = this._currentAnalyse.stylesheets[data.url];                
                if (data.content){
                    this.analyseCssDocument(data.url, data.content, this._currentAnalyse);
                }
            }
            if (this._currentAnalyse.scripts[data.url]){
                item = this._currentAnalyse.scripts[data.url];                
            }
            
            if (item){
                this._currentAnalyse.pendingLoad--;
                item.loaded = true;
                item.content = data.content;
                
                if (this._currentAnalyse.pendingLoad == 0){
                    this._currentAnalyse.processing = false;
                }
            }
        }
        
        analyseDOM(document : HTMLDocument, analyse){
            var generalRules = [];
            var rules = {
                domRulesIndex : <any>{},
                domRulesForAllNodes: []
            };
            analyse.results = {};
            
            //we index rules based on target node types
            for (var n in VORLON.WebStandards.Rules.DOM){
                var rule = <IDOMRule>VORLON.WebStandards.Rules.DOM[n];
                if (rule){
                    if (rule.generalRule){
                        generalRules.push(rule);
                    }else{
                        //console.log("indexing " + rule.id);
                        if (rule.nodeTypes.length){
                            rule.nodeTypes.forEach(function(n){
                                n = n.toUpperCase();
                                if (!rules.domRulesIndex[n])
                                    rules.domRulesIndex[n] = [];
                                    
                                rules.domRulesIndex[n].push(rule);
                            });
                        }else{
                            rules.domRulesForAllNodes.push(rule);
                        }
                    }
                }
            }
            
            this.analyseDOMNode(document, rules, analyse);
            console.log(analyse.results)
            generalRules.forEach((r) => {
                this.applyDOMNodeRule(document, r, analyse);
            });
        }
        
        analyseDOMNode(node : Node, rules: any, analyse){
            //console.log("checking " + node.nodeName);
            var specificRules = rules.domRulesIndex[node.nodeName];
            if (specificRules && specificRules.length){
                console.log((specificRules.length + rules.domRulesForAllNodes.length) + " rules");
                specificRules.forEach((r) => {
                    this.applyDOMNodeRule(node, r, analyse);
                });
            }else{
                //console.log(rules.domRulesForAllNodes.length + " rules");
            }
            
            if (rules.domRulesForAllNodes && rules.domRulesForAllNodes.length){
                rules.domRulesForAllNodes.forEach((r) => {
                    this.applyDOMNodeRule(node, r, analyse);
                });
            }
            
            for (var i=0, l=node.childNodes.length; i<l ; i++){
                this.analyseDOMNode(node.childNodes[i], rules, analyse);
            }
        }
        
        applyDOMNodeRule(node : Node, rule: IDOMRule, analyse){
            var tokens = rule.id.split('.');
            var current = analyse.results;
            tokens.forEach(function(t){
                if (!current[t])
                    current[t] = {};
                    
                current = current[t];
            });
            rule.check(node, current, analyse);
        }
        
        analyseCssDocument(url, content, analyse){
            var parser = new cssjs();
            //parse css string
            var parsed = parser.parseCSS(content);
            console.log("processed css");
            console.log(parsed);
        }
    }
    
    WebStandardsDashboard.prototype.DashboardCommands = {
        htmlContent : function(data:any){
            var plugin = <WebStandardsDashboard>this;
            plugin.receiveHtmlContent(data);
        },
        
        documentContent: function (data: any) {
            var plugin = <WebStandardsDashboard>this;
            plugin.receiveDocumentContent(data);
        }
    };

    //Register the plugin with vorlon core
    Core.RegisterDashboardPlugin(new WebStandardsDashboard());
}

module VORLON.WebStandards.Rules.DOM {
    export var imagesShouldHaveAlt = <IDOMRule>{
        id: "accessibility.images-should-have-alt",
        title : "",
        nodeTypes : ["IMG"],
        check : function(node : Node, rulecheck: any, analyseSummary : any){
            console.log("check alt images");
            var altattr = node.attributes.getNamedItem("alt");
            rulecheck.nbfailed = rulecheck.nbfailed || 0;
            rulecheck.nbcheck = rulecheck.nbcheck || 0;
            rulecheck.nbcheck++;
            if (!altattr || !altattr.value){
                rulecheck.nbfailed++;
                rulecheck.failed = true;
            }else{
                
            }
        }
    }
}