function getBeijingTime() {
    const d = new Date();
    const len = d.getTime();
    const offset = d.getTimezoneOffset() * 60000;
    const utcTime = len + offset;
    return new Date(utcTime + 3600000 * 8);
}

function isTradeTime() {
    const now = getBeijingTime();
    const d = now.getDay();
    // 周六日不交易
    if( d == 0 || d == 6 ) {
        return -1;
    }
    const h = now.getHours();
    const m = now.getMinutes();
    if( h == 10 || h == 13 || h == 14 || h == 9 && m >= 30 || h == 11 && m < 30 ) {
        return 1; // 开盘
    } else if( h == 11 && m > 30 || h == 12 ) {
        return 0; //休盘
    }
    return -1; // 其余时间不交易
}


const v = new Vue({
    el: '#app',
    data: {
        newStockId: '',
        newStockBuyPrice: '',
        stockList: [],
        bjDatetime: '',
        isTradingTime: -1
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
                        stock.change = (stock.price-stock.buyPrice)/stock.buyPrice*100;
                    });
                    this.stockList.sort((a, b) => {
                        return a.change - b.change;
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
                    if( warning.bought ) {
                        // 该档位已买入
                        // 需要判断当前股价是否达到该档位买入价的110%
                        if( stock.price > warning.price * 1.1 ) {
                            // 高于卖出价，提示卖出
                            warning.shouldSell = true;
                            this.notify(`${stock.name} 触及卖出价`);
                            this.save();
                        } else if( warning.shouldSell ) {
                            // 低于卖出价，移除卖出提醒
                            warning.shouldSell = false;
                            this.save();
                        }
                    } else {
                        // 股价涨回到该档位以上了，又没有买入，直接删除就行
                        if( stock.price > warning.price ) {
                            stock.warningList.splice(i--, 1);
                            this.save();
                            continue;
                        }
                    }
                }
                // 检查当前股价，如果低于建仓价则根据低于的比例生成档位提示
                if( stock.price < stock.buyPrice ) {
                    const diff = Math.floor((stock.buyPrice-stock.price)/stock.buyPrice*10);
                    const delta = diff - stock.warningList.length;
                    if( delta > 0 ) {
                        for( let i = stock.warningList.length; i < diff; i++ ) {
                            const level = i + 1;
                            stock.warningList.push({
                                id: level,
                                price: Number((stock.buyPrice * (1-level/10)).toFixed(2)),
                                bought: false,
                                shouldSell: false
                            });
                        }
                        this.save();
                        this.notify(`${stock.name} 触及买入价`)
                    }
                }
                // 反之，当前价高于股价则判断是否脱离成本区
                else {
                    // 现价高出20%就算是脱离了吧
                    if( stock.price / stock.buyPrice > 1.2 ) {
                        if( !stock.hasLeftCostZone ) {
                            stock.hasLeftCostZone = true;
                            this.save();
                        }
                    } else if( stock.hasLeftCostZone ) {
                        stock.hasLeftCostZone = false;
                        this.save();
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
                change: 0,
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
        remove(stock) {
            if( window.confirm(`你确定要删除 ${stock.name} 吗？`) ) {
                const i = this.stockList.findIndex((s) => {
                    return s.sid == stock.sid;
                });
                this.stockList.splice(i, 1);
                this.save();
            }
        },
        mainLoop() {
            if( ( this.isTradingTime = isTradeTime() ) > 0 ) {
                this.frame();
            }
            setTimeout(this.mainLoop, 60 * 1000);
        },
        displayBJTime() {
            function _(number) {
                return number > 9 ? number : `0${number}`;
            }
            const d = getBeijingTime();
            this.bjDatetime = `${_(d.getHours())}:${_(d.getMinutes())}:${_(d.getSeconds())}`;
        }
    },
    mounted() {
        this.load();
        this.mainLoop();
        if( Notification.permission !== 'granted' ) {
            Notification.requestPermission();
        }
        this.displayBJTime();
        setInterval(this.displayBJTime, 1000);
    }
});