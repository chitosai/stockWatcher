function getBeijingTime() {
    const d = new Date();
    const len = d.getTime();
    const offset = d.getTimezoneOffset() * 60000;
    const utcTime = len + offset;
    return new Date(utcTime + 3600000 * 8);
}

function isTradeTime() {
    const now = getBeijingTime();
    const h = now.getHours();
    const m = now.getMinutes();
    if( h == 10 || h == 13 || h == 14 || h == 9 && m >= 30 || h == 11 && m < 30 ) {
        return true;
    }
    return false;
}


const v = new Vue({
    el: '#app',
    data: {
        newStockId: '',
        newStockBuyPrice: '',
        stockList: []
    },
    methods: {
        alert(msg) {
            window.alert(msg)
        },
        notify(msg) {
            new Notification(msg);
        },
        async inquiry() {
            return new Promise((resolve) => {
                sids = this.stockList.map((stock) => {
                    return stock.fullSId;
                }).join(',')
                const node = document.createElement('script');
                node.src = '//hq.sinajs.cn/list=' + sids;
                node.addEventListener('load', () => {
                    this.stockList.forEach((stock) => {
                        let stockData = window[`hq_str_${stock.fullSId}`];
                        stockData = stockData.split(',');
                        stock.name = stockData[0];
                        stock.price = Number(stockData[3]);
                    });
                    node.parentNode.removeChild(node);
                    resolve();
                });
                document.head.append(node);
            })
        },
        calcPrice() {
            this.stockList.forEach((stock) => {
                // 先遍历现有的warning
                for( let i = 0; i < stock.warningList.length; i++ ) {
                    const warning = stock.warningList[i];
                    // 如果当前股价已经回涨到该档位以上
                    if( stock.price > warning.price ) {
                        // 1、买入了，需要等用户自己点击「已卖出」按钮
                        if( warning.bought ) {
                            this.notify(`${stock.name} 触及卖出价`);
                        } else {
                            // 2、没有买入，那么直接删除掉就行了
                            stock.warningList.splice(i--, 1);
                            this.save();
                        }
                    }
                }
                // 检查当前股价，如果低于建仓价则根据低于的比例生成档位提示
                if( stock.price < stock.buyPrice ) {
                    const diff = Math.floor((stock.buyPrice-stock.price)/stock.buyPrice*10);
                    const delta = diff - stock.warningList.length;
                    if( delta > 0 ) {
                        for( let i = 1; i <= delta; i++ ) {
                            const level = i + stock.warningList.length;
                            stock.warningList.push({
                                id: level,
                                price: Number((stock.buyPrice * (1-level/10)).toFixed(2)),
                                bought: false
                            });
                        }
                        this.save();
                        this.notify(`${stock.name} 触及买入价`)
                    }
                }
                // 反之，当前价高于股价则判断是否脱离成本区
                else {
                    // 现在高出20%就算是脱离了吧
                    if( stock.price / stock.buyPrice > 1.2 ) {
                        stock.hasLeftCostZone = true;
                    }
                }
            });
            return true;
        },
        async frame() {
            return new Promise(async (resolve) => {
                await this.inquiry();
                await this.calcPrice();
                resolve();
            });
        },
        async addStock() {
            const sid = this.newStockId;
            if( sid.length != 6 ) {
                return this.alert('请输入6位股票代码');
            }
            if( !this.newStockBuyPrice ) {
                return this.alert('请输入初始建仓价');
            }
            if( this.stockList.find((stock) => {
                return stock.sid == sid;
            }) ) {
                return false;
            }
            this.stockList.push({
                sid,
                fullSId: String(sid).startsWith('6') ? ('sh' + sid) : ('sz' + sid),
                name: '',
                price: '',
                buyPrice: Number(this.newStockBuyPrice),
                hasLeftCostZone: false,
                warningList: []
            });
            this.newStockId = this.newStockBuyPrice = '';
            await this.frame();
            this.save();
        },
        buy(warning) {
            warning.bought = true;
            this.save();
        },
        sell(warning, stock) {
            const id = stock.warningList.findIndex((w) => {
                return w.sid === warning.id;
            });
            stock.warningList.splice(id, 1);
            this.save();
        },
        save() {
            const data = JSON.stringify(this.stockList);
            window.localStorage.setItem('_stock_watcher_data_', data);
        },
        load() {
            const data = window.localStorage.getItem('_stock_watcher_data_');
            if( data ) {
                this.stockList = JSON.parse(data);
            }
        },
        async mainLoop() {
            if( isTradeTime() ) {
                this.frame();
            }
            setTimeout(this.mainLoop, 60 * 1000);
        }
    },
    mounted() {
        this.load();
        this.mainLoop();
        if( Notification.permission !== 'granted' ) {
            Notification.requestPermission();
        }
    }
});