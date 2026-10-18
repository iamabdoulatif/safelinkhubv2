import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import TelegramSettings from './TelegramSettings';

test('new organization gets guided connection, integrated help and no enabled alerts', () => {
  const html = renderToStaticMarkup(<TelegramSettings initial={{bot:null,routers:[],history:[]}} />);
  assert.match(html,/BotFather/); assert.match(html,/type="password"/);
  assert.match(html,/Guide pas à pas/); assert.match(html,/Vérifier mon bot/);
  assert.doesNotMatch(html,/tokenEncrypted|hashPairCode/);
});
test('confirmed destination remains explicit and activation is disabled before test', () => {
  const html = renderToStaticMarkup(<TelegramSettings initial={{bot:{name:'Test',username:'example_bot',chatId:'123456',chatLabel:'Alice',tested:false,enabled:false,preferences:{changes:true,quota:true,releases:false,daily:false},routerIds:['r'],pending:null,error:null},routers:[{id:'r',name:'Kongasso'}],history:[]}} />);
  assert.match(html,/Alice/); assert.match(html,/123456/); assert.match(html,/Envoyer un test/);
  assert.match(html,/disabled=""[^>]*>Activer les alertes/);
});
