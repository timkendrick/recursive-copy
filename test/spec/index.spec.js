'use strict';

var chai = require('chai');
var expect = chai.expect;

describe('recursive-copy', function() {
	var copy;
	before(function() {
		copy = require('../..');
	});

	it('Should export a function', function() {
		expect(copy).to.be.a('function');
	});
});
