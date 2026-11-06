# -*- coding: utf-8 -*-
import json
led = json.load(open(r'D:\dsh-workbench\mail\126\ledger.json', encoding='utf-8'))
for r in led['rows']:
    if r['type'].startswith('课间'):
        print('-' * 60)
        print('学校:', r['school'], '| 主题:', r['title'], '| 发件人:', r['from'], '| 时间:', r['time'])
        print('文件:', r['files'])
        print('包内:', r.get('innerCount'), '媒体:', r.get('media'), '案例文档:', r.get('caseDoc'), '字数:', r.get('caseLen'))
        print('模块:', r.get('modules'))
        print('单位/联系人:', r.get('hasUnit'), r.get('hasContact'), '附件1:', r.get('hasContactSheet'))
        print('通过项:', r.get('passes'))
        print('问题:', r.get('issues'))
        print('结论:', r['verdict'])
