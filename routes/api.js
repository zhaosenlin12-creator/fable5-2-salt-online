const express = require('express');
const userController = require('../controllers/userController');
const gameController = require('../controllers/gameController');
const bulletMarkController = require('../controllers/bulletMarkController');
const corpseFieldController = require('../controllers/corpseFieldController');
const goldSupply = require('../services/goldSupply');
const locales = {
  'zh-CN': require('../locales/zh-CN.json'),
  'en-US': require('../locales/en-US.json')
};

const router = express.Router();

router.get('/hello', userController.hello);
router.get('/health', gameController.health);
router.get('/game/meta', gameController.meta);
router.get('/game/leaderboard', gameController.leaderboard);
router.get('/game/gold/pickups', gameController.goldPickups);
router.get('/game/gold/activity', gameController.goldActivity);
router.get('/game/gold/supply', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(goldSupply.publicStatus());
});
router.get('/game/chat/history', gameController.chatHistory);
router.get('/game/bullet-marks', bulletMarkController.list);
router.get('/game/corpse-field', corpseFieldController.list);
router.get('/focus/status', userController.focusStatus);
router.post('/focus/start', userController.focusStart);

router.post('/lang', (req, res) => {
  const lang = req.body && req.body.lang === 'en-US' ? 'en-US' : 'zh-CN';
  res.cookie('lang', lang, {
    httpOnly: false,
    sameSite: 'lax',
    maxAge: 365 * 24 * 3600 * 1000
  });
  const redirect = req.body && typeof req.body.redirect === 'string' ? req.body.redirect : '';
  const formSubmission = req.is('application/x-www-form-urlencoded') || req.accepts(['json', 'html']) === 'html';
  if (formSubmission && redirect.startsWith('/') && !redirect.startsWith('//')) {
    return res.redirect(303, redirect);
  }
  res.json({ ok: true, message: locales[lang].msg.langSet, lang });
});

module.exports = router;
