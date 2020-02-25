import * as annotationFixtures from '../../test/annotation-fixtures';
import createFakeStore from '../../test/fake-redux-store';

import autosaveService from '../autosave';
import { $imports } from '../autosave';
import { waitFor } from '../../../test-util/wait';

describe('autosaveService', () => {
  let fakeAnnotationsService;
  let fakeNewHighlights;
  let fakeRetryPromiseOperation;
  let fakeStore;

  beforeEach(() => {
    fakeAnnotationsService = { save: sinon.stub().resolves() };
    fakeNewHighlights = sinon.stub().returns([]);
    fakeRetryPromiseOperation = sinon.stub().resolves();
    fakeStore = createFakeStore(
      { annotations: [] },
      { newHighlights: fakeNewHighlights }
    );

    // Fake retry utility that doesn't actually retry anything.
    fakeRetryPromiseOperation = sinon.stub().callsFake(callback => callback());

    $imports.$mock({
      '../util/retry': {
        retryPromiseOperation: fakeRetryPromiseOperation,
      },
    });
  });

  afterEach(() => {
    $imports.$restore();
  });

  it('should subscribe to store updates and check for new highlights', () => {
    const svc = autosaveService(fakeAnnotationsService, fakeStore);
    svc.init();

    fakeStore.setState({
      annotations: ['foo'],
    });

    assert.calledOnce(fakeStore.newHighlights);
  });

  it('should save new highlights', () => {
    const svc = autosaveService(fakeAnnotationsService, fakeStore);
    const newHighlight = annotationFixtures.newHighlight();
    svc.init();
    newHighlight.$tag = 'deadbeef';
    fakeStore.newHighlights.returns([newHighlight]);

    fakeStore.setState({
      annotations: ['foo'],
    });

    assert.calledOnce(fakeAnnotationsService.save);
    assert.calledWith(fakeAnnotationsService.save, newHighlight);
  });

  describe('retries and failures', () => {
    it('should not try to save a highlight that is already being saved', () => {
      const svc = autosaveService(fakeAnnotationsService, fakeStore);
      svc.init();

      const newHighlight = annotationFixtures.newHighlight();
      newHighlight.$tag = 'atag';
      fakeStore.newHighlights.returns([newHighlight]);

      // Fire an initial action that will trigger autosaving.
      fakeStore.setState({});
      assert.isTrue(svc.isSaving());

      // Fire another action before the save completes. This should not cause
      // us to save again.
      fakeStore.setState({});

      // The highlight should only have been saved once.
      assert.calledOnce(fakeAnnotationsService.save);
    });

    it('should not try to save a highlight that has failed to save', async () => {
      fakeAnnotationsService.save.rejects(new Error('Something went wrong'));

      const svc = autosaveService(fakeAnnotationsService, fakeStore);
      svc.init();

      const newHighlight = annotationFixtures.newHighlight();
      newHighlight.$tag = 'atag';
      fakeStore.newHighlights.returns([newHighlight]);

      // Fire an initial action that will trigger autosaving.
      fakeStore.setState({});
      assert.calledOnce(fakeAnnotationsService.save);

      // Wait for the save to fail.
      await waitFor(() => !svc.isSaving());

      fakeAnnotationsService.save.resetHistory();
      fakeStore.setState({});

      // The highlight should not be saved a second time.
      // TBD: How will the UI indicate that it failed?
      assert.notCalled(fakeAnnotationsService.save);
    });
  });
});
