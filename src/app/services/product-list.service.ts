import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import {
  map,
  switchMap,
  debounceTime,
  distinctUntilChanged,
  share,
} from 'rxjs/operators';
import { Store } from '@ngrx/store';
import {
  setCurrentPage,
  setPageSize,
  setSearchText,
} from '../store/actions/filter.actions';
import {
  setProducts,
  setTotalProducts,
} from '../store/actions/product.actions';
import { ProductArray } from '../types/types';
import { Cart, Product } from '../interfaces/interfaces';
import { CartService } from './cart.service';

@Injectable({
  providedIn: 'root',
})
export class ProductListService {
  private apiUrl = 'https://dummyjson.com/products';

  private searchTextSubject = new BehaviorSubject<string>('');
  private pageSizeSubject = new BehaviorSubject<number>(5);
  private currentPageSubject = new BehaviorSubject<number>(1);

  searchText$ = this.searchTextSubject.asObservable();
  pageSize$ = this.pageSizeSubject.asObservable();
  currentPage$ = this.currentPageSubject.asObservable();

  products$!: Observable<ProductArray>;
  totalProducts$!: Observable<number>;

  constructor(
    private http: HttpClient,
    private store: Store<{
      filter: {
        searchText: string;
        pageSize: number;
        currentPage: number;
      };
      products: Cart;
    }>,
    private cartService: CartService
  ) {
    this.initializeDataStreams();
  }

  private initializeDataStreams() {
    const filter$ = combineLatest([
      this.searchText$,
      this.pageSize$,
      this.currentPage$,
      this.cartService.cart$,
    ]).pipe(
      debounceTime(300),
      distinctUntilChanged(
        (prev, curr) =>
          prev[0] === curr[0] && prev[1] === curr[1] && prev[2] === curr[2]
      )
    );

    const response$ = filter$.pipe(
      switchMap(([searchText, pageSize, currentPage]) =>
        this.fetchProducts(searchText, pageSize, currentPage)
      ),
      share()
    );

    this.products$ = response$.pipe(map((response) => response.products));
    this.totalProducts$ = response$.pipe(map((response) => response.total));

    response$.subscribe((response) => {
      this.store.dispatch(setProducts({ productsArr: response.products }));
      this.store.dispatch(
        setTotalProducts({ totalProductsNum: response.total })
      );
    });
  }

  private fetchProducts(
    searchText: string,
    pageSize: number,
    currentPage: number
  ): Observable<any> {
    const skip = (currentPage - 1) * pageSize;
    let url = `${this.apiUrl}?limit=${pageSize}&skip=${skip}`;

    if (searchText) {
      url = `${this.apiUrl}/search?q=${searchText}&limit=${pageSize}&skip=${skip}`;
    }

    let result: ProductArray = [];
    return this.http.get<any>(url).pipe(
      map((response) => {
        this.cartService.cart$.subscribe((cart) => {
          if (cart.totalCartProducts > 0) {
            const updatedWithCart = response.products.map(
              (product: Product) => {
                let cartItem = cart.inCart.find(
                  ({ product: cartItem }) => cartItem.id === product.id
                );
                if (cartItem && product.stock >= cartItem.quantity) {
                  return {
                    ...product,
                    stock: product.stock - cartItem.quantity,
                  };
                } else {
                  return product;
                }
              }
            );

            result = updatedWithCart.filter(
              (product: Product) => product.stock > 0
            );
          } else {
            result = response.products;
          }
        });

        return {
          products: result,
          total: response.total,
        };
      })
    );
  }
  setSearchText(searchText: string) {
    this.searchTextSubject.next(searchText);
    this.store.dispatch(setSearchText({ searchString: searchText }));
    this.setCurrentPage(1);
  }

  setPageSize(pageSize: number) {
    this.pageSizeSubject.next(pageSize);
    this.store.dispatch(setPageSize({ size: pageSize }));
    this.setCurrentPage(1);
  }

  setCurrentPage(page: number) {
    this.currentPageSubject.next(page);
    this.store.dispatch(setCurrentPage({ page }));
  }
}
