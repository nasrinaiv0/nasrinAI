(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const state = { template:'cinematic', clips:[], selected:null, generated:[], cloudProjectId:null, cloudVersion:null, token:'', tokenUntil:0, refreshing:null, objectUrls:new Map(), audioAssets:[], audioTimeline:[], audioProjects:[], audioProjectId:'', audioConfigured:false, audioExportAvailable:false, audioUrls:new Set() };
  const templates = {
    cinematic:{title:'Cinematic opener',sub:'Atmospheric 路 Story-led',prompt:'A cinematic, atmospheric opening shot with elegant camera movement, rich natural textures, soft directional light, subtle film grain, premium color grading, no text or logos.',ratio:'16:9'},
    social:{title:'Social launch',sub:'Bold 路 Fast-paced',prompt:'A bold vertical social media launch video, energetic camera movement, vibrant editorial lighting, crisp detail, fast visual rhythm, polished commercial style, no text or logos.',ratio:'9:16'},
    product:{title:'Product spotlight',sub:'Minimal 路 Premium',prompt:'A premium product hero film with sculptural lighting, elegant shadows, macro detail, slow smooth camera motion, refined neutral palette, high-end commercial cinematography, no text or logos.',ratio:'16:9'},
    story:{title:'Travel story',sub:'Warm 路 Documentary',prompt:'A warm documentary-style travel scene with golden-hour sunlight, authentic environmental details, gentle handheld camera movement, natural colors, cinematic atmosphere, no text or logos.',ratio:'16:9'}
痘玘