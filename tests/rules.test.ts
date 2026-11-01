import {test} from 'node:test'
import assert from 'node:assert/strict'
import {DEFAULT_CATEGORIES,PLACES,rank} from '../src/lib/rules'
test('El reglamento conserva lugares y sugerencias sin inventar puntos para trabajo en equipo',()=>{assert.deepEqual([...PLACES],[600,450,350,300,250,100]);assert.equal(DEFAULT_CATEGORIES.length,23);assert.equal(DEFAULT_CATEGORIES.find(c=>c.id==='cheating')?.suggested_points,60);assert.equal(DEFAULT_CATEGORIES.find(c=>c.id==='first')?.suggested_points,30);assert.equal(DEFAULT_CATEGORIES.find(c=>c.id==='attitude')?.suggested_points,25);assert.equal(DEFAULT_CATEGORIES.find(c=>c.id==='teamwork')?.suggested_points,0)})
test('Los empates comparten posición',()=>{assert.deepEqual(rank([{name:'Leones',total:100},{name:'Osos',total:50},{name:'Lobos',total:100}]).map(t=>t.position),[1,1,3])})
