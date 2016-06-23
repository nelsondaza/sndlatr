#!/bin/bash
# nosetests does not work with sandbox
nosetests tests --with-gae --gae-lib-root=$GAE_PYTHON --without-sandbox \
 --rednose 
