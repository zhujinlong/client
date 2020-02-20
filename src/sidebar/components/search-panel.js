import { createElement } from 'preact';
import { useRef, useState } from 'preact/hooks';
import propTypes from 'prop-types';

import useStore from '../store/use-store';
import uiConstants from '../ui-constants';
import { withServices } from '../util/service-context';

import SidebarPanel from './sidebar-panel';

const countVisibleAnnotations = thread => {
  let count = thread.visible ? 1 : 0;
  for (let child of thread.children) {
    count += countVisibleAnnotations(child);
  }
  return count;
};

function SearchPanel({ rootThread }) {
  const filterQuery = useStore(store => store.filterQuery());
  const setFilterQuery = useStore(store => store.setFilterQuery);

  // The query that the user is currently typing, but may not yet have applied.
  const [pendingQuery, setPendingQuery] = useState(filterQuery);

  const input = useRef(null);

  const onSubmit = e => {
    e.preventDefault();
    setFilterQuery(input.current.value);
  };

  const onOpenChanged = isOpen => {
    if (isOpen) {
      setPendingQuery(filterQuery);
      input.current.focus();
    } else {
      setFilterQuery('');
    }
  };

  const thread = useStore(store => rootThread.thread(store.getState()));

  let statusText;
  if (filterQuery) {
    const count = countVisibleAnnotations(thread);
    if (count === 0) {
      statusText = `No results for "${filterQuery}"`;
    } else {
      statusText = `${count} results for "${filterQuery}"`;
    }
  }

  return (
    <SidebarPanel
      title="Search annotations"
      panelName={uiConstants.PANEL_SEARCH}
      onActiveChanged={onOpenChanged}
    >
      <form
        action="#"
        className="search-panel__form"
        name="searchForm"
        onSubmit={onSubmit}
      >
        <input
          aria-label="Search"
          className="form-input search-panel__input"
          dir="auto"
          type="text"
          name="query"
          placeholder={'Search…'}
          ref={input}
          value={pendingQuery}
          onInput={e => setPendingQuery(e.target.value)}
        />
      </form>
      <span aria-live="polite">
        {statusText && <div className="search-panel__status">{statusText}</div>}
      </span>
    </SidebarPanel>
  );
}

SearchPanel.propTypes = {
  // Injected services.
  rootThread: propTypes.object.isRequired,
};

SearchPanel.injectedProps = ['rootThread'];

export default withServices(SearchPanel);
